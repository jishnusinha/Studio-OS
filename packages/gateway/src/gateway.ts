import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Capability, CostEstimate, ProviderUsage, QualityMode } from '@studio-os/contracts';
import type {
  NormalizedRequest,
  ProviderAdapter,
  ProviderJob,
  ProviderJobStatus,
} from '@studio-os/providers';
import { estimateCost, type EstimateParams } from './estimator.js';
import { ModelRouter, type PricingRule, type RouteConstraints, type RouteResult } from './router.js';

export interface GatewayEstimateRequest {
  capability: Capability;
  modelId?: string;
  providerId?: string;
  prompt?: string;
  parameters?: Record<string, unknown>;
  qualityMode?: QualityMode;
  constraints?: RouteConstraints;
}

export interface SelectedModel {
  modelId: string;
  providerId: string;
}

export interface GatewayExecuteRequest {
  capability: Capability;
  prompt: string;
  negativePrompt?: string;
  parameters?: Record<string, unknown>;
  constraints?: RouteConstraints;
  qualityMode?: QualityMode;
  seed?: number;
  inputUris?: string[];
  pollIntervalMs?: number;
  maxPollAttempts?: number;
}

export interface GatewayExecuteResult {
  text: string;
  outputUris: string[];
  modelId: string;
  providerId: string;
  usage?: ProviderUsage | null;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

async function readTextFromUri(uri: string): Promise<string | null> {
  if (uri.startsWith('data:')) {
    const match = /^data:([^;,]+)?(?:;charset=[^;,]+)?(;base64)?,(.*)$/i.exec(uri);
    if (!match) return null;
    const isBase64 = Boolean(match[2]);
    const payload = match[3] ?? '';
    return isBase64
      ? Buffer.from(payload, 'base64').toString('utf8')
      : decodeURIComponent(payload);
  }
  if (uri.startsWith('file://')) {
    try {
      const path = fileURLToPath(uri);
      return await fs.readFile(path, 'utf8');
    } catch {
      return null;
    }
  }
  if (uri.startsWith('mock://') && uri.includes('data=')) {
    try {
      const q = new URL(uri).searchParams.get('data');
      return q ? decodeURIComponent(q) : null;
    } catch {
      return null;
    }
  }
  return null;
}

export class AiGateway {
  constructor(
    private readonly registry: Map<string, ProviderAdapter>,
    private readonly router: ModelRouter,
    private readonly pricingRules: PricingRule[] = [],
  ) {}

  route(capability: Capability, constraints: RouteConstraints = {}): RouteResult {
    return this.router.route(capability, constraints);
  }

  estimate(req: GatewayEstimateRequest): CostEstimate {
    const constraints: RouteConstraints = {
      ...req.constraints,
      modelId: req.constraints?.modelId ?? req.modelId,
      providerId: req.constraints?.providerId ?? req.providerId,
      qualityMode: req.constraints?.qualityMode ?? req.qualityMode ?? 'draft',
    };

    const selected = this.router.route(req.capability, constraints);

    const params: EstimateParams = {
      ...(req.parameters ?? {}),
      prompt: req.prompt ?? (req.parameters?.prompt as string | undefined),
    };

    return estimateCost(selected.modelId, req.capability, params, this.pricingRules);
  }

  async submit(req: NormalizedRequest, selectedModel: SelectedModel): Promise<ProviderJob> {
    const adapter = this.registry.get(selectedModel.providerId);
    if (!adapter) {
      throw new Error(`No provider adapter registered for: ${selectedModel.providerId}`);
    }

    if (!adapter.capabilities.includes(req.capability)) {
      throw new Error(
        `Provider ${selectedModel.providerId} does not support capability ${req.capability}`,
      );
    }

    return adapter.submit({
      ...req,
      modelId: selectedModel.modelId,
      providerId: selectedModel.providerId,
    });
  }

  async poll(providerId: string, job: ProviderJob): Promise<ProviderJobStatus> {
    const adapter = this.registry.get(providerId);
    if (!adapter) {
      throw new Error(`No provider adapter registered for: ${providerId}`);
    }
    return adapter.poll(job);
  }

  async cancel(providerId: string, job: ProviderJob): Promise<void> {
    const adapter = this.registry.get(providerId);
    if (!adapter) {
      throw new Error(`No provider adapter registered for: ${providerId}`);
    }
    return adapter.cancel(job);
  }

  /**
   * Submit + poll a capability request to completion and return text output when available.
   * Intended for synchronous LLM tasks (e.g. story bible extraction via text.generate).
   */
  async execute(req: GatewayExecuteRequest): Promise<GatewayExecuteResult> {
    const qualityMode = req.qualityMode ?? req.constraints?.qualityMode ?? 'draft';
    const constraints: RouteConstraints = {
      ...req.constraints,
      qualityMode,
    };
    const selected = this.router.route(req.capability, constraints);

    const job = await this.submit(
      {
        capability: req.capability,
        modelId: selected.modelId,
        providerId: selected.providerId,
        prompt: req.prompt,
        negativePrompt: req.negativePrompt,
        parameters: req.parameters ?? {},
        seed: req.seed,
        inputUris: req.inputUris ?? [],
        qualityMode,
      },
      selected,
    );

    const pollIntervalMs = req.pollIntervalMs ?? 50;
    const maxPollAttempts = req.maxPollAttempts ?? 100;
    let status: ProviderJobStatus = {
      status: job.status,
      progress: job.progress,
      outputUris: job.outputUris,
      error: job.error,
      usage: job.usage ?? null,
    };

    for (let i = 0; i < maxPollAttempts; i++) {
      status = await this.poll(selected.providerId, job);
      if (
        status.status === 'completed' ||
        status.status === 'failed' ||
        status.status === 'cancelled'
      ) {
        break;
      }
      await sleep(pollIntervalMs);
    }

    if (status.status !== 'completed') {
      throw new Error(
        status.error ??
          `Gateway execute failed for ${req.capability} (status=${status.status})`,
      );
    }

    const outputUris = status.outputUris ?? [];
    let text = '';
    for (const uri of outputUris) {
      const body = await readTextFromUri(uri);
      if (body != null) {
        text = body;
        break;
      }
    }

    return {
      text,
      outputUris,
      modelId: selected.modelId,
      providerId: selected.providerId,
      usage: status.usage,
    };
  }
}

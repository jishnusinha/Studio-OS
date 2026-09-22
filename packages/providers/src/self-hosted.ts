import type { Capability } from '@studio-os/contracts';
import type {
  NormalizedRequest,
  ProviderAdapter,
  ProviderJob,
  ProviderJobStatus,
} from './types.js';
import { emptyUsage } from './mock/util.js';
import { randomUUID } from 'node:crypto';

export type SelfHostedKind = 'openai-compatible' | 'comfyui';

export interface SelfHostedAdapterConfig {
  id?: string;
  baseUrl: string;
  apiKey?: string;
  kind?: SelfHostedKind;
  capabilities?: Capability[];
  defaultModel?: string;
}

interface StoredJob {
  job: ProviderJob;
  kind: SelfHostedKind;
  pollUrl?: string;
  createdAt: number;
}

/**
 * OpenAI-compatible + ComfyUI-compatible HTTP adapter for self-hosted GPU endpoints.
 * Dormant until an endpoint baseUrl is configured; mocks remain the default elsewhere.
 */
export function createSelfHostedAdapter(config: SelfHostedAdapterConfig): ProviderAdapter {
  const kind: SelfHostedKind = config.kind ?? 'openai-compatible';
  const baseUrl = config.baseUrl.replace(/\/$/, '');
  const jobs = new Map<string, StoredJob>();

  const headers = (): Record<string, string> => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (config.apiKey) h.Authorization = `Bearer ${config.apiKey}`;
    return h;
  };

  return {
    id: config.id ?? 'self-hosted',
    capabilities: config.capabilities ?? [
      'text.generate',
      'image.generate',
      'video.generate',
    ],

    async submit(req: NormalizedRequest): Promise<ProviderJob> {
      const id = randomUUID();
      const providerJobId = randomUUID();
      const model = config.defaultModel ?? req.modelId;

      if (kind === 'comfyui') {
        const promptId = randomUUID();
        const res = await fetch(`${baseUrl}/prompt`, {
          method: 'POST',
          headers: headers(),
          body: JSON.stringify({
            prompt: {
              studioos: {
                class_type: 'StudioOSPrompt',
                inputs: {
                  prompt: req.prompt,
                  negative: req.negativePrompt ?? '',
                  model,
                  seed: req.seed ?? 0,
                  parameters: req.parameters,
                },
              },
            },
            client_id: providerJobId,
          }),
        });
        if (!res.ok) {
          throw new Error(`ComfyUI submit failed (${res.status})`);
        }
        const json = (await res.json()) as { prompt_id?: string };
        const job: ProviderJob = {
          id,
          providerJobId: json.prompt_id ?? promptId,
          status: 'running',
          progress: 0,
        };
        jobs.set(id, {
          job,
          kind,
          pollUrl: `${baseUrl}/history/${json.prompt_id ?? promptId}`,
          createdAt: Date.now(),
        });
        return { ...job };
      }

      // OpenAI-compatible chat / images
      const isImage = req.capability.startsWith('image.');
      if (isImage) {
        const res = await fetch(`${baseUrl}/v1/images/generations`, {
          method: 'POST',
          headers: headers(),
          body: JSON.stringify({
            model,
            prompt: req.prompt,
            n: 1,
            size: (req.parameters.size as string) ?? '1024x1024',
          }),
        });
        if (!res.ok) {
          throw new Error(`Self-hosted image submit failed (${res.status})`);
        }
        const json = (await res.json()) as {
          data?: Array<{ url?: string; b64_json?: string }>;
        };
        const uri =
          json.data?.[0]?.url ??
          (json.data?.[0]?.b64_json
            ? `data:image/png;base64,${json.data[0].b64_json}`
            : undefined);
        const job: ProviderJob = {
          id,
          providerJobId,
          status: 'completed',
          progress: 100,
          outputUris: uri ? [uri] : [],
          usage: emptyUsage(),
        };
        jobs.set(id, { job, kind, createdAt: Date.now() });
        return { ...job };
      }

      const res = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: req.prompt }],
          temperature: (req.parameters.temperature as number) ?? 0.7,
        }),
      });
      if (!res.ok) {
        throw new Error(`Self-hosted chat submit failed (${res.status})`);
      }
      const json = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      const text = json.choices?.[0]?.message?.content ?? '';
      const dataUri = `data:text/plain;base64,${Buffer.from(text, 'utf8').toString('base64')}`;
      const usage = emptyUsage();
      usage.inputTokens = json.usage?.prompt_tokens ?? 0;
      usage.outputTokens = json.usage?.completion_tokens ?? 0;
      const job: ProviderJob = {
        id,
        providerJobId,
        status: 'completed',
        progress: 100,
        outputUris: [dataUri],
        usage,
      };
      jobs.set(id, { job, kind, createdAt: Date.now() });
      return { ...job };
    },

    async poll(job: ProviderJob): Promise<ProviderJobStatus> {
      const stored = jobs.get(job.id);
      if (!stored) {
        return { status: 'failed', progress: 0, error: `Unknown job: ${job.id}` };
      }
      if (stored.job.status === 'completed' || stored.job.status === 'failed') {
        return {
          status: stored.job.status,
          progress: stored.job.progress,
          outputUris: stored.job.outputUris,
          error: stored.job.error,
          usage: stored.job.usage ?? null,
        };
      }
      if (stored.kind === 'comfyui' && stored.pollUrl) {
        const res = await fetch(stored.pollUrl, { headers: headers() });
        if (!res.ok) {
          return { status: 'running', progress: 10 };
        }
        const history = (await res.json()) as Record<string, unknown>;
        if (Object.keys(history).length > 0) {
          stored.job.status = 'completed';
          stored.job.progress = 100;
          stored.job.outputUris = [`comfyui://${stored.job.providerJobId}`];
          stored.job.usage = emptyUsage();
        }
      }
      return {
        status: stored.job.status,
        progress: stored.job.progress,
        outputUris: stored.job.outputUris,
        error: stored.job.error,
        usage: stored.job.usage ?? null,
      };
    },

    async cancel(job: ProviderJob): Promise<void> {
      const stored = jobs.get(job.id);
      if (stored) {
        stored.job.status = 'cancelled';
      }
    },

    async reportedUsage(job: ProviderJob) {
      return jobs.get(job.id)?.job.usage ?? null;
    },
  };
}

/** Lightweight health probe for an inference endpoint. */
export async function checkSelfHostedHealth(
  baseUrl: string,
  kind: SelfHostedKind = 'openai-compatible',
  apiKey?: string,
): Promise<{ ok: boolean; latencyMs: number; message: string }> {
  const start = Date.now();
  const url =
    kind === 'comfyui'
      ? `${baseUrl.replace(/\/$/, '')}/system_stats`
      : `${baseUrl.replace(/\/$/, '')}/v1/models`;
  try {
    const headers: Record<string, string> = {};
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(5000) });
    return {
      ok: res.ok,
      latencyMs: Date.now() - start,
      message: res.ok ? 'healthy' : `HTTP ${res.status}`,
    };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      message: err instanceof Error ? err.message : 'unreachable',
    };
  }
}

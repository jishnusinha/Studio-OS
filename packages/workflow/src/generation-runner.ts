import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { checkBudget, createUsageEvent } from '@studio-os/billing';
import type { CapabilityRequest, CostEstimate, Env, LockedFact, ShotDna, StoryBible } from '@studio-os/contracts';
import {
  assetRelations,
  assets,
  assetVersions,
  budgets,
  characters,
  generationJobSteps,
  generationJobs,
  generationOutputs,
  locations,
  lockedFacts,
  pricingSnapshots,
  projects,
  promptVersions,
  scenes,
  scripts,
  scriptVersions,
  shots,
  styles,
  takes,
  usageEvents,
  type Database,
} from '@studio-os/db';
import { composeShotPromptContext, type AiGateway } from '@studio-os/gateway';
import type { NormalizedRequest, ProviderJob } from '@studio-os/providers';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { WorkflowStepName } from './steps/index.js';

export interface MediaIngestJob {
  assetId: string;
  storageKey: string;
  projectId: string;
}

export interface GenerationWorkflowDeps {
  db: Database;
  gateway: AiGateway;
  s3?: S3Client;
  env: Pick<
    Env,
    | 'DEFAULT_QUALITY_MODE'
    | 'S3_BUCKET'
    | 'S3_ENDPOINT'
    | 'S3_ACCESS_KEY'
    | 'S3_SECRET_KEY'
    | 'S3_REGION'
    | 'S3_FORCE_PATH_STYLE'
  >;
  enqueueMediaIngest?: (job: MediaIngestJob) => Promise<void>;
  logger?: {
    log: (msg: string) => void;
    error: (msg: string, stack?: string) => void;
  };
  pollIntervalMs?: number;
  maxPollAttempts?: number;
}

interface ResolvedBytes {
  buffer: Buffer;
  ext: string;
  mimeType: string;
  width?: number;
  height?: number;
  durationSec?: number;
}

function log(deps: GenerationWorkflowDeps, msg: string): void {
  deps.logger?.log(msg) ?? console.log(msg);
}

function logError(deps: GenerationWorkflowDeps, msg: string, stack?: string): void {
  deps.logger?.error(msg, stack) ?? console.error(msg, stack);
}

function mimeForExt(ext: string): string {
  const map: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    mp4: 'video/mp4',
    webm: 'video/webm',
    mov: 'video/quicktime',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    aac: 'audio/aac',
    json: 'application/json',
    bin: 'application/octet-stream',
  };
  return map[ext.toLowerCase()] ?? 'application/octet-stream';
}

function extFromMime(mime: string): string {
  const map: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/svg+xml': 'svg',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
    'application/json': 'json',
  };
  return map[mime] ?? 'bin';
}

function decodeDataUri(uri: string): ResolvedBytes {
  const match = /^data:([^;,]+)?(?:;charset=[^;,]+)?(;base64)?,(.*)$/i.exec(uri);
  if (!match) throw new Error(`Invalid data URI`);
  const mimeType = match[1] ?? 'application/octet-stream';
  const isBase64 = Boolean(match[2]);
  const payload = match[3] ?? '';
  const buffer = isBase64
    ? Buffer.from(payload, 'base64')
    : Buffer.from(decodeURIComponent(payload), 'utf8');
  return { buffer, ext: extFromMime(mimeType), mimeType };
}

async function fallbackMaterializeMock(uri: string, outDir: string): Promise<{ path: string; mimeType: string }> {
  await fs.mkdir(outDir, { recursive: true });
  const normalized = uri.replace(/^mock:\/\//i, '');
  const [kind, ...rest] = normalized.split('/');
  const slug = (rest.join('_') || 'asset').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);

  if (kind === 'image' || kind?.startsWith('image')) {
    const path = join(outDir, `${slug || 'image'}.svg`);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="1024" height="1024" fill="#1a1a2e"/><text x="512" y="512" text-anchor="middle" fill="#eee" font-size="28">${uri}</text></svg>`;
    await fs.writeFile(path, svg, 'utf8');
    return { path, mimeType: 'image/svg+xml' };
  }
  if (kind === 'video' || kind?.startsWith('video')) {
    const path = join(outDir, `${slug || 'video'}.mp4`);
    await fs.writeFile(path, `StudioOS mock video\nuri=${uri}\n`, 'utf8');
    return { path, mimeType: 'video/mp4' };
  }
  if (
    kind === 'audio' ||
    kind === 'voice' ||
    kind === 'music' ||
    kind?.startsWith('audio') ||
    kind?.startsWith('voice') ||
    kind?.startsWith('music')
  ) {
    const path = join(outDir, `${slug || 'audio'}.wav`);
    await fs.writeFile(path, `RIFF....WAVEfmt StudioOS mock\nuri=${uri}\n`, 'utf8');
    return { path, mimeType: 'audio/wav' };
  }
  const path = join(outDir, `${slug || 'asset'}.bin`);
  await fs.writeFile(path, `StudioOS mock\nuri=${uri}\n`, 'utf8');
  return { path, mimeType: 'application/octet-stream' };
}

async function materializeMockUriSoft(
  uri: string,
  outDir: string,
): Promise<{ path: string; mimeType: string }> {
  try {
    const mod = (await import('@studio-os/media-synth')) as {
      materializeMockUri?: (
        u: string,
        d: string,
      ) => Promise<{ path: string; mimeType: string } | string>;
    };
    if (typeof mod.materializeMockUri === 'function') {
      const result = await mod.materializeMockUri(uri, outDir);
      if (typeof result === 'string') {
        return { path: result, mimeType: mimeForExt(extname(result).slice(1) || 'bin') };
      }
      return result;
    }
  } catch {
    // soft optional — fall through
  }
  return fallbackMaterializeMock(uri, outDir);
}

async function resolveOutputBytes(uri: string, jobId: string): Promise<ResolvedBytes> {
  if (uri.startsWith('file://')) {
    const path = fileURLToPath(uri);
    const buffer = await fs.readFile(path);
    const ext = extname(path).replace(/^\./, '') || 'bin';
    return { buffer, ext, mimeType: mimeForExt(ext) };
  }

  if (uri.startsWith('data:')) {
    return decodeDataUri(uri);
  }

  if (uri.startsWith('mock://')) {
    const outDir = join(tmpdir(), 'studioos-workflow', jobId);
    const { path, mimeType } = await materializeMockUriSoft(uri, outDir);
    const buffer = await fs.readFile(path);
    const ext = extname(path).replace(/^\./, '') || extFromMime(mimeType);
    return { buffer, ext, mimeType };
  }

  if (uri.startsWith('http://') || uri.startsWith('https://')) {
    const res = await fetch(uri);
    if (!res.ok) throw new Error(`Failed to fetch output URI: ${res.status}`);
    const contentType = res.headers.get('content-type')?.split(';')[0]?.trim() ?? 'application/octet-stream';
    const ab = await res.arrayBuffer();
    const buffer = Buffer.from(ab);
    let ext = extFromMime(contentType);
    try {
      const urlPath = new URL(uri).pathname;
      const fromUrl = extname(urlPath).replace(/^\./, '');
      if (fromUrl) ext = fromUrl;
    } catch {
      // ignore
    }
    return { buffer, ext, mimeType: contentType };
  }

  // Treat bare paths as local files
  const buffer = await fs.readFile(uri);
  const ext = extname(uri).replace(/^\./, '') || 'bin';
  return { buffer, ext, mimeType: mimeForExt(ext) };
}

function assetTypeForCapability(capability: string): string {
  if (capability === 'video.matte') return 'image';
  if (capability === 'video.color_grade') return 'other';
  if (capability === 'music.midi') return 'other';
  if (capability === 'audio.stem_split' || capability.startsWith('audio')) return 'audio';
  if (capability.startsWith('video')) return 'video';
  if (capability.startsWith('image')) return 'image';
  if (capability.startsWith('voice') || capability.startsWith('music') || capability.startsWith('sfx')) {
    return 'audio';
  }
  if (capability.startsWith('text')) return 'document';
  return 'other';
}

/** Statuses that `claimGenerationJob` will atomically promote to `running`. */
export const CLAIMABLE_GENERATION_STATUSES = [
  'queued',
  'awaiting_approval',
  'retrying',
] as const;

export type ClaimableGenerationStatus = (typeof CLAIMABLE_GENERATION_STATUSES)[number];

/** Pure status gate mirroring the claim SQL `IN (...)` predicate. */
export function isClaimableGenerationStatus(status: string): status is ClaimableGenerationStatus {
  return (CLAIMABLE_GENERATION_STATUSES as readonly string[]).includes(status);
}

/**
 * Shared generation workflow used by API and generation-worker.
 * Persists step status to generation_job_steps and mutates generation_jobs.
 */
export async function claimGenerationJob(db: Database, jobId: string): Promise<boolean> {
  const claimed = await db
    .update(generationJobs)
    .set({ status: 'running', progress: 5, updatedAt: new Date() })
    .where(
      and(
        eq(generationJobs.id, jobId),
        sql`${generationJobs.status} IN ('queued', 'awaiting_approval', 'retrying')`,
      ),
    )
    .returning({ id: generationJobs.id });
  return claimed.length > 0;
}

export async function runGenerationWorkflow(
  jobId: string,
  deps: GenerationWorkflowDeps,
): Promise<void> {
  const { db, gateway, env } = deps;
  const pollIntervalMs = deps.pollIntervalMs ?? 100;
  const maxPollAttempts = deps.maxPollAttempts ?? 40;

  const [job] = await db.select().from(generationJobs).where(eq(generationJobs.id, jobId)).limit(1);
  if (!job) return;
  if (job.status === 'cancelled') return;

  const request = job.request as CapabilityRequest;
  const stepRows = await db
    .select()
    .from(generationJobSteps)
    .where(eq(generationJobSteps.jobId, jobId));
  const stepByName = new Map(stepRows.map((s) => [s.name, s]));

  let selectedModel = { modelId: job.modelId ?? '', providerId: job.providerId ?? '' };
  let estimate: CostEstimate | null = null;
  let providerJob: ProviderJob | null = null;
  let outputUri: string | null = null;
  let assetId: string | null = null;
  let storageKey: string | null = null;
  let usage: {
    estimatedCostUsd: number;
    customerCostUsd: number;
    images: number;
    outputVideoSeconds: number;
    inputTokens: number;
    outputTokens: number;
  } | null = null;
  let prompt = '';
  let parentAssetIds: string[] = [];

  const setProgress = async (progress: number) => {
    await db
      .update(generationJobs)
      .set({ progress, updatedAt: new Date() })
      .where(eq(generationJobs.id, jobId));
  };

  const mark = async (
    name: WorkflowStepName,
    status: 'running' | 'completed' | 'failed' | 'skipped',
    output: Record<string, unknown> = {},
    error?: string,
  ) => {
    const step = stepByName.get(name);
    if (!step) return;
    await db
      .update(generationJobSteps)
      .set({
        status,
        output,
        error: error ?? null,
        startedAt: status === 'running' ? new Date() : step.startedAt,
        completedAt:
          status === 'completed' || status === 'failed' || status === 'skipped' ? new Date() : null,
      })
      .where(eq(generationJobSteps.id, step.id));
  };

  const fail = async (name: WorkflowStepName, message: string) => {
    await mark(name, 'failed', {}, message);
    await db
      .update(generationJobs)
      .set({ status: 'failed', error: message, updatedAt: new Date() })
      .where(eq(generationJobs.id, jobId));
  };

  try {
    // Claim job to prevent double-execution (API in-process + worker)
    const claimed = await claimGenerationJob(db, jobId);
    if (!claimed) {
      log(deps, `Job ${jobId} already claimed or not runnable — skipping`);
      return;
    }

    // validate
    await mark('validate', 'running');
    if (!request.capability || !request.projectId || !request.workspaceId) {
      await fail('validate', 'Invalid capability request');
      return;
    }
    await mark('validate', 'completed', { ok: true });
    await setProgress(8);

    // resolve_refs
    await mark('resolve_refs', 'running');
    parentAssetIds = request.parentAssetIds ?? [];
    await mark('resolve_refs', 'completed', { parentAssetIds });
    await setProgress(12);

    // fetch_context
    await mark('fetch_context', 'running');
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, request.projectId))
      .limit(1);
    await mark('fetch_context', 'completed', {
      projectName: project?.name ?? null,
      shotId: request.shotId ?? null,
    });
    await setProgress(18);

    // normalize — compile DNA layers into provider prompt when shotId present
    await mark('normalize', 'running');
    let negativePrompt = request.intent.negativePrompt;
    let compiledContext: Record<string, unknown> = {};
    const userDirection =
      request.intent.prompt ??
      (typeof request.intent.shotDna?.direction === 'string'
        ? request.intent.shotDna.direction
        : 'Generate creative output');

    if (request.shotId) {
      const [shot] = await db.select().from(shots).where(eq(shots.id, request.shotId)).limit(1);
      if (shot) {
        const [scene] = await db
          .select()
          .from(scenes)
          .where(eq(scenes.id, shot.sceneId))
          .limit(1);

        const factRows = await db
          .select()
          .from(lockedFacts)
          .where(and(eq(lockedFacts.projectId, shot.projectId), eq(lockedFacts.locked, true)));

        let characterRow =
          shot.characterId != null
            ? (
                await db
                  .select()
                  .from(characters)
                  .where(eq(characters.id, shot.characterId))
                  .limit(1)
              )[0]
            : undefined;
        if (!characterRow) {
          const [fallback] = await db
            .select()
            .from(characters)
            .where(eq(characters.projectId, shot.projectId))
            .limit(1);
          characterRow = fallback;
        }

        let locationRow: (typeof locations.$inferSelect) | undefined;
        if (scene?.locationId) {
          const [loc] = await db
            .select()
            .from(locations)
            .where(eq(locations.id, scene.locationId))
            .limit(1);
          locationRow = loc;
        }

        const [styleRow] = await db
          .select()
          .from(styles)
          .where(eq(styles.projectId, shot.projectId))
          .limit(1);

        const characterNameRows = await db
          .select({ name: characters.name })
          .from(characters)
          .where(eq(characters.projectId, shot.projectId));

        const [script] = await db
          .select()
          .from(scripts)
          .where(eq(scripts.projectId, shot.projectId))
          .orderBy(desc(scripts.createdAt))
          .limit(1);

        let bible: StoryBible | null = null;
        if (script) {
          const [version] = await db
            .select()
            .from(scriptVersions)
            .where(eq(scriptVersions.scriptId, script.id))
            .orderBy(desc(scriptVersions.version))
            .limit(1);
          if (version?.storyBible) {
            bible = version.storyBible as StoryBible;
          }
        }

        const locked: LockedFact[] = factRows.map((f) => ({
          id: f.id,
          entityType: f.entityType as LockedFact['entityType'],
          entityId: f.entityId ?? undefined,
          key: f.key,
          value: f.value,
          locked: f.locked,
          sceneRange: f.sceneRange ?? undefined,
        }));

        const composed = composeShotPromptContext({
          shot: {
            description: shot.description,
            shotDna: (shot.shotDna ?? request.intent.shotDna ?? {}) as ShotDna,
          },
          character: characterRow,
          location: locationRow,
          style: styleRow,
          bible,
          scene: scene ? { synopsis: scene.synopsis, heading: scene.heading } : null,
          characterNames: characterNameRows.map((c) => c.name),
          lockedFacts: locked,
          prompt: request.intent.prompt,
          negativePrompt: request.intent.negativePrompt,
          shotDna: (request.intent.shotDna ?? shot.shotDna ?? {}) as ShotDna,
        });

        prompt = composed.compiled.compiledPrompt || composed.userDirection;
        negativePrompt = composed.compiled.negativePrompt ?? negativePrompt;
        compiledContext = {
          ...composed.compiled.context,
          layers: composed.layers,
          shotId: request.shotId,
        };

        await db.insert(promptVersions).values({
          jobId,
          userDirection: composed.userDirection,
          compiledPrompt: prompt,
          negativePrompt: negativePrompt ?? null,
          context: compiledContext,
        });
      } else {
        prompt = userDirection;
      }
    } else {
      prompt = userDirection;
    }

    const normalized: NormalizedRequest = {
      capability: request.capability,
      modelId: request.constraints.modelId ?? '',
      providerId: request.constraints.providerId ?? '',
      prompt,
      negativePrompt,
      parameters: request.intent.parameters ?? {},
      seed: request.intent.seed,
      inputUris: [],
      qualityMode: request.constraints.qualityMode ?? env.DEFAULT_QUALITY_MODE,
    };
    await mark('normalize', 'completed', {
      prompt: normalized.prompt,
      negativePrompt: normalized.negativePrompt ?? null,
      dnaCompiled: Boolean(request.shotId),
      context: compiledContext,
    });
    await setProgress(25);

    // route
    await mark('route', 'running');
    const routed = gateway.route(request.capability, {
      modelId: request.constraints.modelId,
      providerId: request.constraints.providerId,
      qualityMode: request.constraints.qualityMode,
      budgetUsd: request.constraints.budgetUsd,
    });
    selectedModel = { modelId: routed.modelId, providerId: routed.providerId };
    normalized.modelId = routed.modelId;
    normalized.providerId = routed.providerId;
    await db
      .update(generationJobs)
      .set({
        modelId: routed.modelId,
        providerId: routed.providerId,
        updatedAt: new Date(),
      })
      .where(eq(generationJobs.id, jobId));
    await mark('route', 'completed', { ...routed });
    await setProgress(32);

    // estimate
    await mark('estimate', 'running');
    estimate = gateway.estimate({
      capability: request.capability,
      modelId: selectedModel.modelId,
      providerId: selectedModel.providerId,
      prompt: normalized.prompt,
      parameters: {
        ...normalized.parameters,
        duration: request.intent.shotDna?.durationSec,
        durationSec: request.intent.shotDna?.durationSec,
      },
      qualityMode: request.constraints.qualityMode,
    });
    await db
      .update(generationJobs)
      .set({
        estimatedCostUsd: String(estimate.maxUsd),
        updatedAt: new Date(),
      })
      .where(eq(generationJobs.id, jobId));
    await mark('estimate', 'completed', estimate as unknown as Record<string, unknown>);
    await setProgress(40);

    // budget_check
    await mark('budget_check', 'running');
    const [budgetRow] = await db
      .select()
      .from(budgets)
      .where(and(eq(budgets.scopeType, 'project'), eq(budgets.scopeId, request.projectId)))
      .limit(1);
    const proposed = estimate.maxUsd;
    if (budgetRow) {
      const result = checkBudget(
        {
          limitUsd: Number(budgetRow.limitUsd),
          spentUsd: Number(budgetRow.spentUsd),
          hardLimit: budgetRow.hardLimit,
          maxJobCostUsd: budgetRow.maxJobCostUsd != null ? Number(budgetRow.maxJobCostUsd) : null,
        },
        proposed,
      );
      if (!result.allowed) {
        await fail('budget_check', result.reason ?? 'Budget exceeded');
        return;
      }

      const approvalThreshold =
        budgetRow.requireApprovalAboveUsd != null
          ? Number(budgetRow.requireApprovalAboveUsd)
          : null;
      if (approvalThreshold != null && proposed > approvalThreshold) {
        await mark('budget_check', 'completed', {
          awaitingApproval: true,
          proposed,
          requireApprovalAboveUsd: approvalThreshold,
        });
        await db
          .update(generationJobs)
          .set({
            status: 'awaiting_approval',
            updatedAt: new Date(),
          })
          .where(eq(generationJobs.id, jobId));
        return;
      }

      await mark('budget_check', 'completed', result as unknown as Record<string, unknown>);
    } else {
      await mark('budget_check', 'completed', { skipped: true, proposed });
    }
    await setProgress(48);

    // submit
    await mark('submit', 'running');
    await db
      .update(generationJobs)
      .set({ status: 'waiting_provider', updatedAt: new Date() })
      .where(eq(generationJobs.id, jobId));
    providerJob = await gateway.submit(normalized, selectedModel);
    await db
      .update(generationJobs)
      .set({
        providerJobId: providerJob.providerJobId,
        updatedAt: new Date(),
      })
      .where(eq(generationJobs.id, jobId));
    await mark('submit', 'completed', {
      providerJobId: providerJob.providerJobId,
      status: providerJob.status,
    });
    await setProgress(55);

    // poll
    await mark('poll', 'running');
    let pollStatus = await gateway.poll(selectedModel.providerId, providerJob);
    let attempts = 0;
    while (
      (pollStatus.status === 'queued' || pollStatus.status === 'running') &&
      attempts < maxPollAttempts
    ) {
      const latest = await db
        .select({ status: generationJobs.status })
        .from(generationJobs)
        .where(eq(generationJobs.id, jobId))
        .limit(1);
      if (latest[0]?.status === 'cancelled') {
        await gateway.cancel(selectedModel.providerId, providerJob);
        await mark('poll', 'skipped', { cancelled: true });
        return;
      }
      await new Promise((r) => setTimeout(r, pollIntervalMs));
      pollStatus = await gateway.poll(selectedModel.providerId, providerJob);
      attempts += 1;
      await setProgress(Math.min(70, 55 + attempts));
    }
    if (pollStatus.status !== 'completed') {
      await fail('poll', pollStatus.error ?? `Provider status: ${pollStatus.status}`);
      return;
    }
    outputUri = pollStatus.outputUris?.[0] ?? `mock://output/${jobId}`;
    await mark('poll', 'completed', {
      status: pollStatus.status,
      outputUri,
      usage: pollStatus.usage ?? null,
    });
    await setProgress(72);

    // meter
    await mark('meter', 'running');
    const providerCost = pollStatus.usage?.providerCostUsd ?? estimate.minUsd;
    const customerCost = Number((providerCost * 1.3).toFixed(6));
    usage = {
      estimatedCostUsd: estimate.maxUsd,
      customerCostUsd: customerCost,
      images: pollStatus.usage?.images ?? (request.capability.startsWith('image') ? 1 : 0),
      outputVideoSeconds:
        pollStatus.usage?.outputVideoSeconds ??
        (request.capability.startsWith('video')
          ? Number(request.intent.shotDna?.durationSec ?? 4)
          : 0),
      inputTokens: pollStatus.usage?.inputTokens ?? 0,
      outputTokens: pollStatus.usage?.outputTokens ?? 0,
    };
    const snapshotId = randomUUID();
    await db.insert(pricingSnapshots).values({
      id: snapshotId,
      rules: [],
    });
    const event = createUsageEvent({
      jobId,
      workspaceId: request.workspaceId,
      projectId: request.projectId,
      userId: job.userId,
      providerId: selectedModel.providerId,
      modelId: selectedModel.modelId,
      inputTokens: usage.inputTokens,
      cachedInputTokens: 0,
      outputTokens: usage.outputTokens,
      images: usage.images,
      outputVideoSeconds: usage.outputVideoSeconds,
      outputAudioSeconds: 0,
      estimatedCostUsd: usage.estimatedCostUsd,
      actualProviderCostUsd: providerCost,
      customerCostUsd: usage.customerCostUsd,
      varianceUsd: usage.customerCostUsd - usage.estimatedCostUsd,
      pricingSnapshotId: snapshotId,
      status: 'completed',
    });
    await db.insert(usageEvents).values({
      id: event.id,
      jobId: event.jobId,
      workspaceId: event.workspaceId,
      projectId: event.projectId,
      userId: event.userId,
      providerId: event.providerId,
      modelId: event.modelId,
      inputTokens: String(event.inputTokens),
      outputTokens: String(event.outputTokens),
      images: String(event.images),
      outputVideoSeconds: String(event.outputVideoSeconds),
      estimatedCostUsd: String(event.estimatedCostUsd),
      actualProviderCostUsd: String(event.actualProviderCostUsd ?? 0),
      customerCostUsd: String(event.customerCostUsd),
      varianceUsd: String(event.varianceUsd ?? 0),
      pricingSnapshotId: event.pricingSnapshotId,
      status: event.status,
      createdAt: event.createdAt,
    });

    const costLiteral = customerCost.toFixed(6);
    await db
      .update(projects)
      .set({
        spentUsd: sql`(${projects.spentUsd})::numeric + ${costLiteral}::numeric`,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, request.projectId));

    const [budgetAfter] = await db
      .select()
      .from(budgets)
      .where(and(eq(budgets.scopeType, 'project'), eq(budgets.scopeId, request.projectId)))
      .limit(1);
    const nextSpent = Number(budgetAfter?.spentUsd ?? 0) + customerCost;
    const limit = Number(budgetAfter?.limitUsd ?? 0);
    const alertFlags: Record<string, boolean> = {};
    if (budgetAfter && limit > 0) {
      const pct = (nextSpent / limit) * 100;
      if (pct >= 50) alertFlags.alert50 = true;
      if (pct >= 75) alertFlags.alert75 = true;
      if (pct >= 90) alertFlags.alert90 = true;
      if (pct >= 100) alertFlags.alert100 = true;
    }
    await db
      .update(budgets)
      .set({
        spentUsd: sql`(${budgets.spentUsd})::numeric + ${costLiteral}::numeric`,
        ...alertFlags,
        updatedAt: new Date(),
      })
      .where(and(eq(budgets.scopeType, 'project'), eq(budgets.scopeId, request.projectId)));

    await db
      .update(generationJobs)
      .set({
        actualCostUsd: String(usage.customerCostUsd),
        pricingSnapshotId: snapshotId,
        updatedAt: new Date(),
      })
      .where(eq(generationJobs.id, jobId));
    await mark('meter', 'completed', {
      usageEventId: event.id,
      customerCostUsd: usage.customerCostUsd,
      varianceUsd: event.varianceUsd,
      budgetAlerts: Object.keys(alertFlags),
    });
    await setProgress(80);

    // store — resolve bytes, PutObject, asset + version, take, outputs, media-ingest
    await mark('store', 'running');
    const assetType = assetTypeForCapability(request.capability);
    const newAssetId = randomUUID();
    const resolved = await resolveOutputBytes(outputUri, jobId);
    const checksum = createHash('sha256').update(resolved.buffer).digest('hex');
    storageKey = `projects/${request.projectId}/assets/${newAssetId}/v1/source.${resolved.ext}`;

    if (deps.s3) {
      await deps.s3.send(
        new PutObjectCommand({
          Bucket: env.S3_BUCKET,
          Key: storageKey,
          Body: resolved.buffer,
          ContentType: resolved.mimeType,
          ContentLength: resolved.buffer.byteLength,
        }),
      );
    } else {
      log(deps, `[workflow] no S3 client — skipping PutObject for ${storageKey}`);
    }

    let durationSec: number | null = resolved.durationSec ?? null;
    if (durationSec == null && assetType === 'video') {
      const n = Number(request.intent.shotDna?.durationSec ?? usage.outputVideoSeconds ?? 0);
      durationSec = n > 0 ? n : null;
    }

    const [asset] = await db
      .insert(assets)
      .values({
        id: newAssetId,
        projectId: request.projectId,
        type: assetType,
        name: `gen-${jobId.slice(0, 8)}`,
        mimeType: resolved.mimeType,
        sizeBytes: resolved.buffer.byteLength,
        status: 'ready',
        createdBy: job.userId,
        metadata: {
          uri: outputUri,
          storageKey,
          jobId,
          modelId: selectedModel.modelId,
          providerId: selectedModel.providerId,
        },
      })
      .returning();
    assetId = asset?.id ?? newAssetId;

    await db.insert(assetVersions).values({
      assetId: assetId,
      version: 1,
      storageKey,
      checksum,
      width: resolved.width ?? null,
      height: resolved.height ?? null,
      durationSec: durationSec != null && durationSec > 0 ? Math.round(durationSec) : null,
      metadata: { sourceUri: outputUri },
    });

    if (asset && request.shotId) {
      const existingTakes = await db.select().from(takes).where(eq(takes.shotId, request.shotId));
      await db.insert(takes).values({
        shotId: request.shotId,
        number: existingTakes.length + 1,
        assetId: asset.id,
        status: 'ready',
        modelId: selectedModel.modelId,
        providerId: selectedModel.providerId,
        costUsd: usage.customerCostUsd,
        promptCompiled: prompt,
        metadata: { uri: outputUri, storageKey },
      });
    }
    if (asset) {
      await db.insert(generationOutputs).values({
        jobId,
        assetId: asset.id,
        takeNumber: 1,
      });
    }

    if (deps.enqueueMediaIngest && assetId && storageKey) {
      await deps.enqueueMediaIngest({
        assetId,
        storageKey,
        projectId: request.projectId,
      });
    }

    await mark('store', 'completed', { assetId, outputUri, storageKey, checksum });
    await setProgress(88);

    // lineage
    await mark('lineage', 'running');
    if (assetId) {
      for (const parentId of parentAssetIds) {
        await db.insert(assetRelations).values({
          parentAssetId: parentId,
          childAssetId: assetId,
          relationType: 'generated_from',
          metadata: { jobId },
        });
      }
    }
    await mark('lineage', 'completed', {
      relations: parentAssetIds.length,
      childAssetId: assetId,
    });
    await setProgress(95);

    // notify
    await mark('notify', 'running');
    log(deps, `Generation job ${jobId} completed asset=${assetId}`);
    await mark('notify', 'completed', { notified: true });

    await db
      .update(generationJobs)
      .set({
        status: 'completed',
        progress: 100,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(generationJobs.id, jobId));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logError(deps, `Job ${jobId} error: ${message}`, err instanceof Error ? err.stack : undefined);
    await db
      .update(generationJobs)
      .set({ status: 'failed', error: message, updatedAt: new Date() })
      .where(eq(generationJobs.id, jobId));
  }
}

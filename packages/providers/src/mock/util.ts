import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ProviderUsage } from '@studio-os/contracts';
import type { NormalizedRequest, ProviderJob, ProviderJobStatus } from '../types.js';

const POLL_READY_MS = 100;

export type FinalizeResult = Pick<ProviderJob, 'outputUris' | 'usage' | 'error'>;

export interface StoredMockJob {
  job: ProviderJob;
  createdAt: number;
  cancelled: boolean;
  finalize: () => FinalizeResult | Promise<FinalizeResult>;
}

export function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function resolveSeed(req: NormalizedRequest): number {
  if (typeof req.seed === 'number' && Number.isFinite(req.seed)) {
    return Math.trunc(req.seed);
  }
  return hashString(`${req.capability}:${req.prompt}:${req.modelId}`);
}

/** Absolute path → file:// URI (Windows-safe). */
export function toFileUri(absPath: string): string {
  const normalized = absPath.replace(/\\/g, '/');
  if (/^[a-zA-Z]:\//.test(normalized)) return `file:///${normalized}`;
  if (normalized.startsWith('/')) return `file://${normalized}`;
  return `file:///${normalized}`;
}

/** Write bytes under os.tmpdir()/studioos-mock/ and return the absolute path. */
export async function writeStudioOsMockFile(filename: string, buffer: Buffer): Promise<string> {
  const dir = join(tmpdir(), 'studioos-mock');
  await fs.mkdir(dir, { recursive: true });
  const path = join(dir, filename);
  await fs.writeFile(path, buffer);
  return path;
}

export function createJobStore() {
  const jobs = new Map<string, StoredMockJob>();

  function submit(
    _req: NormalizedRequest,
    finalize: StoredMockJob['finalize'],
  ): ProviderJob {
    const id = randomUUID();
    const providerJobId = randomUUID();
    const job: ProviderJob = {
      id,
      providerJobId,
      status: 'running',
      progress: 0,
    };
    jobs.set(id, {
      job,
      createdAt: Date.now(),
      cancelled: false,
      finalize,
    });
    return { ...job };
  }

  async function poll(job: ProviderJob): Promise<ProviderJobStatus> {
    const stored = jobs.get(job.id);
    if (!stored) {
      return {
        status: 'failed',
        progress: 0,
        error: `Unknown job: ${job.id}`,
      };
    }

    if (stored.cancelled) {
      stored.job = {
        ...stored.job,
        status: 'cancelled',
        progress: stored.job.progress,
      };
      return {
        status: 'cancelled',
        progress: stored.job.progress,
        error: stored.job.error,
        usage: stored.job.usage ?? null,
        outputUris: stored.job.outputUris,
      };
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

    const elapsed = Date.now() - stored.createdAt;
    if (elapsed < POLL_READY_MS) {
      const progress = Math.min(99, Math.floor((elapsed / POLL_READY_MS) * 100));
      stored.job = { ...stored.job, progress, status: 'running' };
      return {
        status: 'running',
        progress,
        usage: null,
      };
    }

    try {
      const result = await stored.finalize();
      stored.job = {
        ...stored.job,
        status: 'completed',
        progress: 100,
        outputUris: result.outputUris,
        usage: result.usage,
        error: result.error,
      };
    } catch (err) {
      stored.job = {
        ...stored.job,
        status: 'failed',
        progress: stored.job.progress,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    return {
      status: stored.job.status,
      progress: stored.job.progress,
      outputUris: stored.job.outputUris,
      error: stored.job.error,
      usage: stored.job.usage ?? null,
    };
  }

  async function cancel(job: ProviderJob): Promise<void> {
    const stored = jobs.get(job.id);
    if (!stored) return;
    if (stored.job.status === 'completed' || stored.job.status === 'failed') return;
    stored.cancelled = true;
    stored.job = { ...stored.job, status: 'cancelled' };
  }

  async function reportedUsage(job: ProviderJob): Promise<ProviderUsage | null> {
    const stored = jobs.get(job.id);
    return stored?.job.usage ?? job.usage ?? null;
  }

  return { submit, poll, cancel, reportedUsage, jobs };
}

export function emptyUsage(overrides: Partial<ProviderUsage> = {}): ProviderUsage {
  return {
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    inputCharacters: 0,
    inputAudioSeconds: 0,
    outputAudioSeconds: 0,
    inputVideoSeconds: 0,
    outputVideoSeconds: 0,
    images: 0,
    megapixels: 0,
    ...overrides,
  };
}

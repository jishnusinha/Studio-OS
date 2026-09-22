import type { Capability } from '@studio-os/contracts';
import { synthesizeVideo } from '@studio-os/media-synth';
import type { NormalizedRequest, ProviderAdapter, ProviderJob, ProviderJobStatus } from '../types.js';
import { createJobStore, emptyUsage, resolveSeed, toFileUri, writeStudioOsMockFile } from './util.js';

const store = createJobStore();

function numParam(params: Record<string, unknown>, key: string, fallback: number): number {
  const value = params[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return fallback;
}

export const mockVideoAdapter: ProviderAdapter = {
  id: 'mock-video',
  capabilities: ['video.generate', 'video.edit', 'video.upscale'] satisfies Capability[],

  async submit(req: NormalizedRequest): Promise<ProviderJob> {
    const seed = resolveSeed(req);
    const duration =
      numParam(req.parameters, 'duration', numParam(req.parameters, 'durationSec', 4));
    const seconds = Math.max(0.1, duration);
    const width = Math.max(2, Math.trunc(numParam(req.parameters, 'width', 640)));
    const height = Math.max(2, Math.trunc(numParam(req.parameters, 'height', 360)));
    const label =
      typeof req.parameters.shotCode === 'string'
        ? req.parameters.shotCode
        : req.prompt.slice(0, 48) || undefined;
    const mockUri = `mock://video/${seed}.mp4`;

    return store.submit(req, async () => {
      const usage = emptyUsage({
        outputVideoSeconds: seconds,
        providerCostUsd: 0.05 * seconds,
      });

      try {
        // Cap synth length so finalize stays fast; usage still reports requested seconds.
        const synth = await synthesizeVideo({
          durationSec: Math.min(seconds, 1),
          width,
          height,
          fps: 12,
          seed,
          label,
        });
        const path = await writeStudioOsMockFile(`video-${seed}.${synth.ext}`, synth.buffer);
        return {
          outputUris: [toFileUri(path), mockUri],
          usage,
        };
      } catch {
        return { outputUris: [mockUri], usage };
      }
    });
  },

  async poll(job: ProviderJob): Promise<ProviderJobStatus> {
    return store.poll(job);
  },

  async cancel(job: ProviderJob): Promise<void> {
    return store.cancel(job);
  },

  async reportedUsage(job: ProviderJob) {
    return store.reportedUsage(job);
  },
};

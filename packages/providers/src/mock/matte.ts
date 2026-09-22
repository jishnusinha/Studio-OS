import type { Capability } from '@studio-os/contracts';
import { synthesizeMatte } from '@studio-os/media-synth';
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

export const mockMatteAdapter: ProviderAdapter = {
  id: 'mock-matte',
  capabilities: ['video.matte'] satisfies Capability[],

  async submit(req: NormalizedRequest): Promise<ProviderJob> {
    const seed = resolveSeed(req);
    const width = Math.max(2, Math.trunc(numParam(req.parameters, 'width', 512)));
    const height = Math.max(2, Math.trunc(numParam(req.parameters, 'height', 512)));
    const mockUri = `mock://matte/${seed}.svg?width=${width}&height=${height}`;

    return store.submit(req, async () => {
      const usage = emptyUsage({
        images: 1,
        megapixels: (width * height) / 1_000_000,
        resolution: `${width}x${height}`,
        providerCostUsd: 0.05,
      });

      try {
        const synth = await synthesizeMatte({
          width,
          height,
          seed,
          label: req.prompt.slice(0, 32) || undefined,
        });
        const path = await writeStudioOsMockFile(`matte-${seed}.${synth.ext}`, synth.buffer);
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

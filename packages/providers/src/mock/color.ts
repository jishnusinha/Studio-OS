import type { Capability } from '@studio-os/contracts';
import { synthesizeLut } from '@studio-os/media-synth';
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

export const mockColorAdapter: ProviderAdapter = {
  id: 'mock-color',
  capabilities: ['video.color_grade'] satisfies Capability[],

  async submit(req: NormalizedRequest): Promise<ProviderJob> {
    const seed = resolveSeed(req);
    const seconds = Math.max(
      0.1,
      numParam(req.parameters, 'duration', numParam(req.parameters, 'durationSec', 4)),
    );
    const mockUri = `mock://lut/${seed}.cube`;

    return store.submit(req, async () => {
      const usage = emptyUsage({
        inputVideoSeconds: seconds,
        outputVideoSeconds: seconds,
        providerCostUsd: 0.02 * seconds,
      });

      try {
        const synth = synthesizeLut({
          seed,
          size: 16,
          label: req.prompt.slice(0, 40) || undefined,
        });
        const path = await writeStudioOsMockFile(`lut-${seed}.${synth.ext}`, synth.buffer);
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

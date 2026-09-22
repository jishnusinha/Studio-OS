import type { Capability } from '@studio-os/contracts';
import { synthesizeMidi } from '@studio-os/media-synth';
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

export const mockMidiAdapter: ProviderAdapter = {
  id: 'mock-midi',
  capabilities: ['music.midi'] satisfies Capability[],

  async submit(req: NormalizedRequest): Promise<ProviderJob> {
    const seed = resolveSeed(req);
    const seconds = Math.max(
      1,
      numParam(req.parameters, 'duration', numParam(req.parameters, 'durationSec', 16)),
    );
    const bpm = Math.max(40, Math.min(240, Math.trunc(numParam(req.parameters, 'bpm', 120))));
    const mockUri = `mock://midi/${seed}.mid?duration=${seconds}`;

    return store.submit(req, async () => {
      const usage = emptyUsage({
        outputAudioSeconds: seconds,
        providerCostUsd: 0.005 * seconds,
      });

      try {
        const synth = synthesizeMidi({
          durationSec: seconds,
          seed,
          tempoBpm: bpm,
        });
        const path = await writeStudioOsMockFile(`midi-${seed}.${synth.ext}`, synth.buffer);
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

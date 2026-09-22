import type { Capability } from '@studio-os/contracts';
import { synthesizeAudio } from '@studio-os/media-synth';
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

export const mockMusicAdapter: ProviderAdapter = {
  id: 'mock-music',
  capabilities: ['music.generate', 'sfx.generate'] satisfies Capability[],

  async submit(req: NormalizedRequest): Promise<ProviderJob> {
    const seed = resolveSeed(req);
    const seconds = Math.max(
      1,
      numParam(req.parameters, 'duration', numParam(req.parameters, 'durationSec', 30)),
    );
    const mockUri = `mock://music/${seed}.mp3`;

    return store.submit(req, async () => {
      const usage = emptyUsage({
        outputAudioSeconds: seconds,
        providerCostUsd: 0.01 * seconds,
      });

      try {
        // Cap synth length so finalize stays fast; usage still reports requested seconds.
        const synthDuration = Math.min(seconds, 3);
        const synth = await synthesizeAudio({
          durationSec: synthDuration,
          seed,
          kind: 'music',
        });
        const path = await writeStudioOsMockFile(`music-${seed}.${synth.ext}`, synth.buffer);
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

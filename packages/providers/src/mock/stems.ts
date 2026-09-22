import type { Capability } from '@studio-os/contracts';
import { synthesizeStems } from '@studio-os/media-synth';
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

export const mockStemsAdapter: ProviderAdapter = {
  id: 'mock-stems',
  capabilities: ['audio.stem_split'] satisfies Capability[],

  async submit(req: NormalizedRequest): Promise<ProviderJob> {
    const seed = resolveSeed(req);
    const seconds = Math.max(
      1,
      numParam(req.parameters, 'duration', numParam(req.parameters, 'durationSec', 30)),
    );
    const mockUri = `mock://stems/${seed}.json`;

    return store.submit(req, async () => {
      const usage = emptyUsage({
        inputAudioSeconds: seconds,
        outputAudioSeconds: seconds * 4,
        providerCostUsd: (0.04 / 60) * seconds,
      });

      try {
        const synth = await synthesizeStems({
          durationSec: Math.min(seconds, 2),
          seed,
        });
        const uris: string[] = [];
        for (const stem of synth.stems) {
          const path = await writeStudioOsMockFile(
            `stem-${seed}-${stem.name}.${stem.ext}`,
            stem.buffer,
          );
          uris.push(toFileUri(path));
        }
        const manifestPath = await writeStudioOsMockFile(`stems-${seed}.json`, synth.buffer);
        uris.push(toFileUri(manifestPath), mockUri);
        return { outputUris: uris, usage };
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

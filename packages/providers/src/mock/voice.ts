import type { Capability } from '@studio-os/contracts';
import { synthesizeAudio } from '@studio-os/media-synth';
import type { NormalizedRequest, ProviderAdapter, ProviderJob, ProviderJobStatus } from '../types.js';
import { createJobStore, emptyUsage, resolveSeed, toFileUri, writeStudioOsMockFile } from './util.js';

const store = createJobStore();

export const mockVoiceAdapter: ProviderAdapter = {
  id: 'mock-voice',
  capabilities: ['voice.tts', 'voice.stt', 'voice.clone'] satisfies Capability[],

  async submit(req: NormalizedRequest): Promise<ProviderJob> {
    const seed = resolveSeed(req);
    const characters = req.prompt.length;
    const seconds = Math.max(0.5, characters / 15);
    const mockUri = `mock://voice/${seed}.wav`;

    return store.submit(req, async () => {
      const usage = emptyUsage({
        inputCharacters: characters,
        outputAudioSeconds: seconds,
        providerCostUsd: characters * 0.00002,
      });

      try {
        const synth = await synthesizeAudio({
          durationSec: seconds,
          seed,
          kind: 'voice',
        });
        const path = await writeStudioOsMockFile(`voice-${seed}.${synth.ext}`, synth.buffer);
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

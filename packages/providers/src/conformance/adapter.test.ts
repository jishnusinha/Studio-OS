import { describe, expect, it } from 'vitest';
import type { Capability } from '@studio-os/contracts';
import { mockColorAdapter } from '../mock/color.js';
import { mockEmbedAdapter } from '../mock/embed.js';
import { mockImageAdapter } from '../mock/image.js';
import { mockLlmAdapter } from '../mock/llm.js';
import { mockMatteAdapter } from '../mock/matte.js';
import { mockMidiAdapter } from '../mock/midi.js';
import { mockMusicAdapter } from '../mock/music.js';
import { mockStemsAdapter } from '../mock/stems.js';
import { mockVideoAdapter } from '../mock/video.js';
import { mockVoiceAdapter } from '../mock/voice.js';
import type { NormalizedRequest, ProviderAdapter } from '../types.js';

const cases: Array<{ adapter: ProviderAdapter; capability: Capability; prompt: string }> = [
  { adapter: mockLlmAdapter, capability: 'text.generate', prompt: 'Write a logline.' },
  { adapter: mockImageAdapter, capability: 'image.generate', prompt: 'A quiet street at dusk.' },
  { adapter: mockVideoAdapter, capability: 'video.generate', prompt: 'Dolly in on a doorway.' },
  { adapter: mockVoiceAdapter, capability: 'voice.tts', prompt: 'Hello from StudioOS.' },
  { adapter: mockMusicAdapter, capability: 'music.generate', prompt: 'Sparse piano motif.' },
  { adapter: mockEmbedAdapter, capability: 'text.embed', prompt: 'embed this sentence' },
  { adapter: mockStemsAdapter, capability: 'audio.stem_split', prompt: 'Split mix into stems.' },
  { adapter: mockColorAdapter, capability: 'video.color_grade', prompt: 'Warm cinematic grade.' },
  { adapter: mockMatteAdapter, capability: 'video.matte', prompt: 'Soft elliptical matte.' },
  { adapter: mockMidiAdapter, capability: 'music.midi', prompt: 'Simple motif in C.' },
];

function baseRequest(
  adapter: ProviderAdapter,
  capability: Capability,
  prompt: string,
): NormalizedRequest {
  return {
    capability,
    modelId: `${adapter.id}-default`,
    providerId: adapter.id,
    prompt,
    parameters: {
      width: 256,
      height: 256,
      duration: 2,
      durationSec: 2,
    },
    seed: 42,
    inputUris: [],
    qualityMode: 'draft',
  };
}

async function waitForCompleted(adapter: ProviderAdapter, jobId: string) {
  const started = Date.now();
  let status = await adapter.poll({
    id: jobId,
    providerJobId: jobId,
    status: 'running',
    progress: 0,
  });

  while (status.status === 'running' || status.status === 'queued') {
    if (Date.now() - started > 15000) {
      throw new Error(`Timed out waiting for ${adapter.id}`);
    }
    await new Promise((r) => setTimeout(r, 25));
    status = await adapter.poll({
      id: jobId,
      providerJobId: jobId,
      status: status.status,
      progress: status.progress,
    });
  }

  return status;
}

describe('mock provider adapters conformance', () => {
  for (const { adapter, capability, prompt } of cases) {
    it(`${adapter.id} submits and polls to completed for ${capability}`, async () => {
      const job = await adapter.submit(baseRequest(adapter, capability, prompt));
      expect(job.status).toBe('running');
      expect(job.id).toBeTruthy();

      const status = await waitForCompleted(adapter, job.id);
      expect(status.status).toBe('completed');
      expect(status.progress).toBe(100);
      expect(status.outputUris?.length).toBeGreaterThan(0);
      expect(status.usage).toBeTruthy();
    });
  }
});

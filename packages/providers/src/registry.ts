import type { Capability, ProviderUsage } from '@studio-os/contracts';
import type {
  NormalizedRequest,
  ProviderAdapter,
  ProviderJob,
  ProviderJobStatus,
} from './types.js';
import { mockColorAdapter } from './mock/color.js';
import { mockEmbedAdapter } from './mock/embed.js';
import { mockImageAdapter } from './mock/image.js';
import { mockLlmAdapter } from './mock/llm.js';
import { mockMatteAdapter } from './mock/matte.js';
import { mockMidiAdapter } from './mock/midi.js';
import { mockMusicAdapter } from './mock/music.js';
import { mockStemsAdapter } from './mock/stems.js';
import { mockVideoAdapter } from './mock/video.js';
import { mockVoiceAdapter } from './mock/voice.js';
import { createSelfHostedAdapter, type SelfHostedKind } from './self-hosted.js';

export const MOCK_ADAPTERS: ProviderAdapter[] = [
  mockLlmAdapter,
  mockImageAdapter,
  mockVideoAdapter,
  mockVoiceAdapter,
  mockMusicAdapter,
  mockEmbedAdapter,
  mockStemsAdapter,
  mockColorAdapter,
  mockMatteAdapter,
  mockMidiAdapter,
];

/** Dispatches providerId `mock` to per-model adapters (mock-video, mock-image, …). */
export function createMockDispatcher(registry: Map<string, ProviderAdapter>): ProviderAdapter {
  const findByCapability = (capability: string): ProviderAdapter | undefined => {
    for (const adapter of MOCK_ADAPTERS) {
      if (adapter.capabilities.includes(capability as Capability)) return adapter;
    }
    return undefined;
  };

  return {
    id: 'mock',
    capabilities: MOCK_ADAPTERS.flatMap((a) => a.capabilities),
    async submit(req: NormalizedRequest) {
      const adapter = registry.get(req.modelId) ?? findByCapability(req.capability);
      if (!adapter) throw new Error(`No mock adapter for model ${req.modelId}`);
      return adapter.submit(req);
    },
    async poll(job: ProviderJob): Promise<ProviderJobStatus> {
      for (const adapter of MOCK_ADAPTERS) {
        const status = await adapter.poll(job);
        if (status.error?.startsWith('Unknown job:')) continue;
        return status;
      }
      return { status: 'failed', progress: 0, error: `Unknown job: ${job.id}` };
    },
    async cancel(job: ProviderJob): Promise<void> {
      for (const adapter of MOCK_ADAPTERS) {
        const status = await adapter.poll(job);
        if (status.error?.startsWith('Unknown job:')) continue;
        await adapter.cancel(job);
        return;
      }
    },
    async reportedUsage(job: ProviderJob): Promise<ProviderUsage | null> {
      for (const adapter of MOCK_ADAPTERS) {
        const status = await adapter.poll(job);
        if (status.error?.startsWith('Unknown job:')) continue;
        return adapter.reportedUsage(job);
      }
      return null;
    },
  };
}

export function createProviderRegistry(useMock = true): Map<string, ProviderAdapter> {
  const registry = new Map<string, ProviderAdapter>();
  if (useMock) {
    for (const adapter of MOCK_ADAPTERS) {
      registry.set(adapter.id, adapter);
    }
    registry.set('mock', createMockDispatcher(registry));
  }
  return registry;
}

/** Register a self-hosted adapter when providers.kind === 'self-hosted'. */
export function registerSelfHostedProvider(
  registry: Map<string, ProviderAdapter>,
  config: {
    providerId: string;
    baseUrl: string;
    apiKey?: string;
    kind?: SelfHostedKind;
    capabilities?: Capability[];
  },
): ProviderAdapter {
  const adapter = createSelfHostedAdapter({
    id: config.providerId,
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    kind: config.kind,
    capabilities: config.capabilities,
  });
  registry.set(config.providerId, adapter);
  registry.set('self-hosted', adapter);
  return adapter;
}

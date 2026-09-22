export type {
  NormalizedRequest,
  ProviderAdapter,
  ProviderJob,
  ProviderJobStatus,
} from './types.js';

export { createProviderRegistry, createMockDispatcher, registerSelfHostedProvider, MOCK_ADAPTERS } from './registry.js';

export { mockLlmAdapter, buildMockStoryBibleJson } from './mock/llm.js';
export { mockImageAdapter } from './mock/image.js';
export { mockVideoAdapter } from './mock/video.js';
export { mockVoiceAdapter } from './mock/voice.js';
export { mockMusicAdapter } from './mock/music.js';
export { mockEmbedAdapter } from './mock/embed.js';
export { mockStemsAdapter } from './mock/stems.js';
export { mockColorAdapter } from './mock/color.js';
export { mockMatteAdapter } from './mock/matte.js';
export { mockMidiAdapter } from './mock/midi.js';

export {
  createSelfHostedAdapter,
  checkSelfHostedHealth,
  type SelfHostedAdapterConfig,
  type SelfHostedKind,
} from './self-hosted.js';
export {
  createJobStore,
  emptyUsage,
  hashString,
  resolveSeed,
} from './mock/util.js';
export type { StoredMockJob } from './mock/util.js';

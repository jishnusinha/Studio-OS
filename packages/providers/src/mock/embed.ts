import type { Capability } from '@studio-os/contracts';
import type { NormalizedRequest, ProviderAdapter, ProviderJob, ProviderJobStatus } from '../types.js';
import { createJobStore, emptyUsage, hashString, resolveSeed } from './util.js';

const store = createJobStore();
const EMBED_DIM = 384;

function seededUnitFloat(seed: number, index: number): number {
  let x = (seed ^ Math.imul(index + 1, 0x9e3779b9)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  x ^= x >>> 16;
  return (x >>> 0) / 0xffffffff;
}

function buildEmbedding(seed: number, text: string): number[] {
  const textHash = hashString(text);
  const combined = (seed ^ textHash) >>> 0;
  const values = new Array<number>(EMBED_DIM);
  let norm = 0;
  for (let i = 0; i < EMBED_DIM; i++) {
    const v = seededUnitFloat(combined, i) * 2 - 1;
    values[i] = v;
    norm += v * v;
  }
  const scale = norm > 0 ? 1 / Math.sqrt(norm) : 1;
  return values.map((v) => v * scale);
}

export const mockEmbedAdapter: ProviderAdapter = {
  id: 'mock-embed',
  capabilities: ['text.embed'] satisfies Capability[],

  async submit(req: NormalizedRequest): Promise<ProviderJob> {
    const seed = resolveSeed(req);
    const embedding = buildEmbedding(seed, req.prompt);
    const payload = JSON.stringify({ dim: EMBED_DIM, seed, embedding });
    const uri = `mock://embed/${seed}.json?data=${encodeURIComponent(payload)}`;

    return store.submit(req, () => ({
      outputUris: [uri],
      usage: emptyUsage({
        inputTokens: Math.max(1, Math.ceil(req.prompt.length / 4)),
        providerCostUsd: 0.0001,
      }),
    }));
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

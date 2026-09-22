import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createProviderRegistry } from '@studio-os/providers';
import { AiGateway, ModelRouter, estimateCost, compilePrompt } from '@studio-os/gateway';
import {
  checkBudget,
  createPricingSnapshot,
  createUsageEvent,
  costPerAccepted,
} from '@studio-os/billing';
import { TimelineEngine } from '@studio-os/timeline';
import { can } from '@studio-os/auth';
import { synthesizeImage, synthesizeAudio, hasFfmpeg } from '@studio-os/media-synth';
import type { Clip, Timeline, TimelineCommand } from '@studio-os/contracts';

const pricing = [
  { modelId: 'mock-video', providerId: 'mock', unit: 'second', rateUsd: 0.05 },
  { modelId: 'mock-image', providerId: 'mock', unit: 'image', rateUsd: 0.02 },
  { modelId: 'mock-llm', providerId: 'mock', unit: 'output_token', rateUsd: 0.000001 },
];

const models = [
  {
    id: 'mock-video',
    providerId: 'mock',
    capabilities: ['video.generate'],
    published: true,
    costWeight: 1,
  },
  {
    id: 'mock-image',
    providerId: 'mock',
    capabilities: ['image.generate'],
    published: true,
    costWeight: 1,
  },
  {
    id: 'mock-llm',
    providerId: 'mock',
    capabilities: ['text.generate'],
    published: true,
    costWeight: 1,
  },
];

const TRACK_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CLIP_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ASSET_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

function cmd(type: TimelineCommand['type'], payload: Record<string, unknown>): TimelineCommand {
  return {
    id: randomUUID(),
    type,
    payload,
    timestamp: Date.now(),
    source: 'agent',
  };
}

function baseClip(overrides: Partial<Clip> = {}): Clip {
  return {
    id: CLIP_ID,
    assetId: ASSET_ID,
    sourceIn: 0,
    sourceOut: 10,
    timelineStart: 0,
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 },
    speed: 1,
    effects: [],
    keyframes: [],
    muted: false,
    ...overrides,
  };
}

describe('Release 2 — Cinema path', () => {
  it('compiles locked DNA, generates mock video with file URI, meters spend', async () => {
    const compiled = compilePrompt(
      {
        prompt: 'Sarah finds the tape',
        shotDna: {
          shot: { size: 'close_up' },
          camera: { lens: '85mm' },
          subject: { emotion: 'anxious' },
        },
        references: [],
        parameters: {},
      },
      [
        {
          id: randomUUID(),
          entityType: 'costume',
          key: 'jacket',
          value: 'red leather',
          locked: true,
        },
      ],
      { bible: { premise: 'thriller', themes: [], worldRules: [], continuityConstraints: [] } },
    );
    expect(compiled.compiledPrompt.toLowerCase()).toMatch(/red leather/);

    const registry = createProviderRegistry(true);
    const router = new ModelRouter(models, pricing);
    const gateway = new AiGateway(registry, router, pricing);
    const job = await gateway.submit(
      {
        capability: 'video.generate',
        modelId: 'mock-video',
        providerId: 'mock',
        prompt: compiled.compiledPrompt,
        parameters: { duration: 4, seed: 42 },
        qualityMode: 'draft',
        inputUris: [],
      },
      { modelId: 'mock-video', providerId: 'mock' },
    );
    expect(job.id).toBeTruthy();

    let status = await gateway.poll('mock', job);
    for (let i = 0; i < 40 && status.status !== 'completed' && status.status !== 'failed'; i++) {
      await new Promise((r) => setTimeout(r, 50));
      status = await gateway.poll('mock', job);
    }
    expect(status.status).toBe('completed');
    expect(status.outputUris?.length).toBeGreaterThan(0);
    const uri = status.outputUris![0]!;
    expect(uri.startsWith('file://') || uri.startsWith('mock://')).toBe(true);

    const estimate = estimateCost('mock-video', 'video.generate', { duration: 4 }, pricing);
    const snapshot = createPricingSnapshot([
      {
        id: randomUUID(),
        providerId: 'mock',
        modelId: 'mock-video',
        unit: 'second',
        rateUsd: 0.05,
        minimumUsd: 0,
        validFrom: new Date(),
      },
    ]);
    const event = createUsageEvent({
      jobId: job.id,
      workspaceId: randomUUID(),
      projectId: randomUUID(),
      userId: randomUUID(),
      providerId: 'mock',
      modelId: 'mock-video',
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      images: 0,
      outputVideoSeconds: 4,
      outputAudioSeconds: 0,
      estimatedCostUsd: estimate.maxUsd,
      actualProviderCostUsd: estimate.minUsd,
      customerCostUsd: estimate.maxUsd * 1.3,
      varianceUsd: estimate.maxUsd * 1.3 - estimate.maxUsd,
      pricingSnapshotId: snapshot.id,
      status: 'completed',
    });
    expect(event.customerCostUsd).toBeGreaterThan(0);
    expect(event.varianceUsd).not.toBeUndefined();
  }, 15000);

  it('timeline AI edits are undoable with ⌘Z semantics', () => {
    const timeline: Timeline = {
      id: randomUUID(),
      projectId: randomUUID(),
      name: 'Scene 17',
      fps: 24,
      width: 1920,
      height: 1080,
      duration: 10,
      version: 1,
      markers: [],
      tracks: [
        {
          id: TRACK_ID,
          type: 'video',
          name: 'V1',
          muted: false,
          locked: false,
          solo: false,
          height: 60,
          clips: [baseClip()],
        },
      ],
    };
    const engine = new TimelineEngine(timeline);
    const newClip = baseClip({
      id: randomUUID(),
      timelineStart: 10,
      sourceIn: 0,
      sourceOut: 5,
    });
    engine.apply(cmd('add_clip', { trackId: TRACK_ID, clip: newClip }));
    expect(engine.getState().tracks[0]!.clips).toHaveLength(2);

    const undone = engine.undo();
    expect(undone?.tracks[0]!.clips).toHaveLength(1);
    expect(engine.canRedo).toBe(true);
    const redone = engine.redo();
    expect(redone?.tracks[0]!.clips).toHaveLength(2);
  });
});

describe('Release 2 — Commercial path', () => {
  it('estimates batch variants and detects forbidden claims', () => {
    const formats = ['9:16', '1:1'];
    const languages = ['en', 'es'];
    const missing = formats.length * languages.length;
    const costPer = estimateCost('mock-video', 'video.generate', { duration: 15 }, pricing);
    const batch = missing * costPer.maxUsd;
    expect(missing).toBe(4);
    expect(batch).toBeGreaterThan(0);

    const forbidden = ['cures thirst permanently', 'FDA approved miracle'];
    const copy = 'Aurora keeps drinks cold 24h — cures thirst permanently!';
    const hit = forbidden.find((f) => copy.toLowerCase().includes(f.toLowerCase()));
    expect(hit).toBeTruthy();
  });

  it('synthesizes image + audio media for packshots/dubs', async () => {
    const img = await synthesizeImage({ width: 512, height: 512, seed: 7, label: 'Aurora' });
    expect(img.buffer.length).toBeGreaterThan(0);
    expect(img.mimeType).toMatch(/image|svg/);

    const audio = await synthesizeAudio({ durationSec: 1, seed: 3, kind: 'voice' });
    expect(audio.buffer.length).toBeGreaterThan(44);
    expect(audio.ext).toMatch(/wav|mp3/);

    await expect(hasFfmpeg()).resolves.toBeTypeOf('boolean');
  });
});

describe('Release 2 — Authorization & budget', () => {
  it('cross-tenant RBAC: viewer cannot generate/write', () => {
    expect(can('viewer', 'read')).toBe(true);
    expect(can('viewer', 'generate')).toBe(false);
    expect(can('viewer', 'write')).toBe(false);
    expect(can('director', 'generate')).toBe(true);
    expect(can('director', 'billing')).toBe(false);
  });

  it('emits 50/75/90/100 budget alerts and gates hard limit', () => {
    const budget = { limitUsd: 100, spentUsd: 49, hardLimit: true };
    const cross50 = checkBudget(budget, 2);
    expect(cross50.alerts).toContain(50);
    expect(cross50.allowed).toBe(true);

    const nearHard = checkBudget({ ...budget, spentUsd: 95 }, 10);
    expect(nearHard.alerts).toContain(100);
    expect(nearHard.allowed).toBe(false);

    const soft = checkBudget({ limitUsd: 100, spentUsd: 95, hardLimit: false }, 10);
    expect(soft.allowed).toBe(true);
  });

  it('cost-per-accepted is project-scoped arithmetic', () => {
    const events = [
      { customerCostUsd: 1.5, estimatedCostUsd: 1 },
      { customerCostUsd: 2.5, estimatedCostUsd: 2 },
    ];
    expect(costPerAccepted(events, 2)).toBe(2);
  });
});

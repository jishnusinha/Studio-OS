import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createProviderRegistry } from '@studio-os/providers';
import { AiGateway, ModelRouter, estimateCost, compilePrompt } from '@studio-os/gateway';
import {
  checkBudget,
  createPricingSnapshot,
  createUsageEvent,
  reconcile,
  costPerAccepted,
  wasteRatio,
} from '@studio-os/billing';
import { TimelineEngine } from '@studio-os/timeline';
import { traverseDescendants, markDependentsStale } from '@studio-os/graph';
import { LocalIdentityProvider } from '@studio-os/auth';
import type { Timeline } from '@studio-os/contracts';

describe('StudioOS foundation vertical slice', () => {
  it('routes, estimates, generates via mock, and meters usage', async () => {
    const registry = createProviderRegistry(true);
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
    ];
    const pricing = [
      { modelId: 'mock-video', providerId: 'mock', unit: 'second', rateUsd: 0.05 },
    ];
    const router = new ModelRouter(models, pricing);
    const route = router.route('video.generate', { qualityMode: 'draft' });
    expect(route.modelId).toBe('mock-video');
    expect(route.reason.length).toBeGreaterThan(0);

    const estimate = estimateCost('mock-video', 'video.generate', { duration: 5 }, pricing);
    expect(estimate.minUsd).toBeGreaterThan(0);

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
    expect(compiled.compiledPrompt.toLowerCase()).toMatch(/sarah|close|85mm|anxious|red leather/);

    const gateway = new AiGateway(registry, router, pricing);
    const job = await gateway.submit(
      {
        capability: 'video.generate',
        modelId: 'mock-video',
        providerId: 'mock',
        prompt: compiled.compiledPrompt,
        parameters: { duration: 5 },
        qualityMode: 'draft',
        inputUris: [],
      },
      { modelId: 'mock-video', providerId: 'mock' },
    );

    let status = await gateway.poll('mock', job);
    const deadline = Date.now() + 5000;
    while ((status.status === 'running' || status.status === 'queued') && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 50));
      status = await gateway.poll('mock', job);
    }
    expect(status.status).toBe('completed');
    expect(status.outputUris?.length).toBeGreaterThan(0);

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
    const reconciled = reconcile(estimate.minUsd, status.usage?.providerCostUsd ?? null);
    const event = createUsageEvent({
      workspaceId: randomUUID(),
      projectId: randomUUID(),
      userId: randomUUID(),
      providerId: 'mock',
      modelId: 'mock-video',
      estimatedCostUsd: estimate.minUsd,
      actualProviderCostUsd: status.usage?.providerCostUsd ?? null,
      customerCostUsd: reconciled.customerCostUsd,
      varianceUsd: reconciled.varianceUsd,
      pricingSnapshotId: snapshot.id,
      outputVideoSeconds: 5,
    });
    expect(event.customerCostUsd).toBeGreaterThan(0);
    expect(costPerAccepted([event], 1)).toBeGreaterThan(0);
    expect(wasteRatio(4, 1)).toBeCloseTo(0.75);

    const budget = checkBudget(
      { limitUsd: 500, spentUsd: 0, hardLimit: true, maxJobCostUsd: 25 },
      event.customerCostUsd,
    );
    expect(budget.allowed).toBe(true);
  });

  it('applies timeline commands undoably', () => {
    const assetId = randomUUID();
    const trackId = randomUUID();
    const timeline: Timeline = {
      id: randomUUID(),
      projectId: randomUUID(),
      name: 'Master',
      fps: 24,
      width: 1920,
      height: 1080,
      duration: 0,
      tracks: [
        {
          id: trackId,
          type: 'video',
          name: 'V1',
          muted: false,
          locked: false,
          solo: false,
          height: 60,
          clips: [],
        },
      ],
      markers: [],
      version: 1,
    };
    const engine = new TimelineEngine(timeline);
    const clipA = {
      id: randomUUID(),
      assetId,
      sourceIn: 0,
      sourceOut: 5,
      timelineStart: 0,
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 },
      speed: 1,
      effects: [],
      keyframes: [],
      muted: false,
    };
    engine.apply({
      id: randomUUID(),
      type: 'add_clip',
      timestamp: Date.now(),
      source: 'user',
      payload: { trackId, clip: clipA },
    });
    engine.apply({
      id: randomUUID(),
      type: 'add_clip',
      timestamp: Date.now(),
      source: 'user',
      payload: {
        trackId,
        clip: { ...clipA, id: randomUUID(), timelineStart: 8, sourceOut: 4 },
      },
    });
    expect(engine.getState().tracks[0]!.clips.length).toBe(2);
    engine.undo();
    expect(engine.getState().tracks[0]!.clips.length).toBe(1);
    engine.redo();
    expect(engine.getState().tracks[0]!.clips.length).toBe(2);
  });

  it('marks dependents stale when a parent asset changes', () => {
    const a = randomUUID();
    const b = randomUUID();
    const c = randomUUID();
    const relations = [
      { parentAssetId: a, childAssetId: b, relationType: 'generated_from' },
      { parentAssetId: b, childAssetId: c, relationType: 'edited_from' },
    ];
    expect(traverseDescendants(a, relations)).toEqual(expect.arrayContaining([b, c]));
    const updated = markDependentsStale(a, relations);
    expect(updated.filter((r) => r.stale).length).toBeGreaterThan(0);
  });

  it('hashes passwords and issues session tokens', async () => {
    const idp = new LocalIdentityProvider();
    const hash = await idp.hashPassword('studioos-demo');
    expect(await idp.verifyPassword('studioos-demo', hash)).toBe(true);
    const secret = 'dev-jwt-secret-change-in-production-min-32-chars';
    const token = await idp.createSessionToken('user-1', secret);
    const payload = await idp.verifySessionToken(token, secret);
    expect(payload?.userId).toBe('user-1');
  });
});

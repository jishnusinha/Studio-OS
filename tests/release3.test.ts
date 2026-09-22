import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createProviderRegistry } from '@studio-os/providers';
import { TimelineEngine } from '@studio-os/timeline';
import {
  createBillingProvider,
  MockBillingProvider,
} from '@studio-os/billing';
import {
  interpretGraph,
  isClaimableGenerationStatus,
  CLAIMABLE_GENERATION_STATUSES,
} from '@studio-os/workflow';
import {
  buildC2paLiteClaim,
  generateDevKeyPair,
  signC2paClaim,
  verifyC2paClaim,
} from '@studio-os/provenance';
import { initTelemetry, isOtlpEnabled, clearSpans } from '@studio-os/observability';
import type { Clip, Timeline, TimelineCommand } from '@studio-os/contracts';

const TRACK_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CLIP_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ASSET_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

/** Mirrors ContinuityService locked-fact penalty (−0.25) and 0.75 violation threshold. */
function scoreLockedFactMismatch(
  expected: string,
  observed: string | null | undefined,
  base = 1,
  penalty = 0.25,
  threshold = 0.75,
): { score: number; violated: boolean } {
  let score = base;
  if (observed != null && observed !== '' && observed !== expected) {
    score = Math.max(0, base - penalty);
  }
  return { score, violated: score < threshold };
}

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

function baseTimeline(): Timeline {
  return {
    id: randomUUID(),
    projectId: randomUUID(),
    name: 'Pro Lab',
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
}

describe('Release 3 — Continuity scoring concepts', () => {
  it('locked fact mismatch yields a low violating score', () => {
    const match = scoreLockedFactMismatch('red leather', 'red leather');
    expect(match.score).toBe(1);
    expect(match.violated).toBe(false);

    // Single −0.25 lands on the 0.75 threshold (not yet < threshold)
    const one = scoreLockedFactMismatch('red leather', 'blue denim');
    expect(one.score).toBe(0.75);
    expect(one.violated).toBe(false);

    // Second mismatch (as ContinuityService accumulates) drops below threshold
    const two = scoreLockedFactMismatch('red leather', 'blue denim', one.score);
    expect(two.score).toBe(0.5);
    expect(two.violated).toBe(true);
  });
});

describe('Release 3 — Audio stem / MIDI capability routing', () => {
  it('routes stem_split and midi via mock registry adapters', async () => {
    const registry = createProviderRegistry(true);
    const stems = registry.get('mock-stems');
    const midi = registry.get('mock-midi');
    expect(stems?.capabilities).toContain('audio.stem_split');
    expect(midi?.capabilities).toContain('music.midi');

    const dispatcher = registry.get('mock');
    expect(dispatcher).toBeTruthy();

    const stemJob = await dispatcher!.submit({
      capability: 'audio.stem_split',
      modelId: 'mock-stems',
      providerId: 'mock',
      prompt: 'split stems',
      parameters: { duration: 1 },
      qualityMode: 'draft',
      inputUris: [],
    });
    expect(stemJob.id).toBeTruthy();

    const midiJob = await dispatcher!.submit({
      capability: 'music.midi',
      modelId: 'mock-midi',
      providerId: 'mock',
      prompt: 'pad sequence',
      parameters: { duration: 2, bpm: 100 },
      qualityMode: 'draft',
      inputUris: [],
    });
    expect(midiJob.id).toBeTruthy();
  });
});

describe('Release 3 — Color grade + multicam timeline commands', () => {
  it('applies color grade and undoes it', () => {
    const engine = new TimelineEngine(baseTimeline());
    engine.apply(
      cmd('set_color_grade', {
        clipId: CLIP_ID,
        grade: { brightness: 0.08, contrast: 1.15, lut: 'lab-teal' },
      }),
    );
    const grade = engine
      .getState()
      .tracks[0]?.clips[0]?.effects.find((e) => e.type === 'color_grade');
    expect(grade?.parameters).toMatchObject({ brightness: 0.08, lut: 'lab-teal' });

    const undone = engine.undo();
    expect(undone?.tracks[0]?.clips[0]?.effects.find((e) => e.type === 'color_grade')).toBeUndefined();
    expect(engine.canRedo).toBe(true);
  });

  it('stores multicam angle on clip effects', () => {
    const engine = new TimelineEngine(baseTimeline());
    engine.apply(cmd('set_multicam_angle', { clipId: CLIP_ID, angle: 'B' }));
    const multicam = engine
      .getState()
      .tracks[0]?.clips[0]?.effects.find((e) => e.type === 'multicam');
    expect(multicam?.parameters?.angle).toBe('B');
  });
});

describe('Release 3 — Workflow graph interpret', () => {
  it('interprets a route → normalize graph', async () => {
    const result = await interpretGraph(
      {
        entry: 'start',
        nodes: [
          { key: 'start', type: 'route', config: { route: 'ok' } },
          { key: 'done', type: 'normalize' },
        ],
        edges: [{ sourceKey: 'start', targetKey: 'done', condition: { field: 'route', equals: 'ok' } }],
      },
      { budgetUsd: 10 },
    );
    expect(result.status).toBe('completed');
    expect(result.steps.length).toBeGreaterThanOrEqual(2);
    expect(result.output.route).toBe('ok');
  });
});

describe('Release 3 — Stripe mock BillingProvider lifecycle', () => {
  it('creates customer + subscription via MockBillingProvider', async () => {
    const provider = createBillingProvider(null);
    expect(provider).toBeInstanceOf(MockBillingProvider);
    expect(provider.kind).toBe('mock');

    const customer = await provider.createCustomer({
      organizationId: randomUUID(),
      email: 'billing@studioos.local',
      name: 'Demo Studio',
    });
    expect(customer.customerId).toMatch(/^cus_mock_/);
    expect(customer.provider).toBe('mock');

    const sub = await provider.createSubscription({
      customerId: customer.customerId,
      planCode: 'pro',
    });
    expect(sub.subscriptionId).toMatch(/^sub_mock_/);
    expect(sub.status).toBe('active');
  });
});

describe('Release 3 — C2PA-lite sign/verify', () => {
  it('signs and verifies claims with node crypto', () => {
    const keys = generateDevKeyPair();
    const claim = buildC2paLiteClaim({
      assetId: randomUUID(),
      projectId: randomUUID(),
      title: 'Lab Export',
      action: 'c2pa.created',
      modelId: 'mock-video',
    });
    const signature = signC2paClaim(claim, keys.privateKeyPem);
    expect(signature.length).toBeGreaterThan(32);
    expect(verifyC2paClaim(claim, signature, keys.publicKeyPem)).toBe(true);
    expect(verifyC2paClaim({ ...claim, title: 'tampered' }, signature, keys.publicKeyPem)).toBe(
      false,
    );
  });
});

describe('Release 3 — claimGenerationJob status gate', () => {
  it('only queued / awaiting_approval / retrying are claimable', () => {
    expect(CLAIMABLE_GENERATION_STATUSES).toEqual([
      'queued',
      'awaiting_approval',
      'retrying',
    ]);
    expect(isClaimableGenerationStatus('queued')).toBe(true);
    expect(isClaimableGenerationStatus('awaiting_approval')).toBe(true);
    expect(isClaimableGenerationStatus('retrying')).toBe(true);
    expect(isClaimableGenerationStatus('running')).toBe(false);
    expect(isClaimableGenerationStatus('completed')).toBe(false);
    expect(isClaimableGenerationStatus('failed')).toBe(false);
  });
});

describe('Release 3 — Observability OTLP gate', () => {
  it('initTelemetry is a no-op without OTEL_EXPORTER_OTLP_ENDPOINT', () => {
    clearSpans();
    const prev = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    initTelemetry({ endpoint: null, serviceName: 'test' });
    expect(isOtlpEnabled()).toBe(false);
    if (prev !== undefined) process.env.OTEL_EXPORTER_OTLP_ENDPOINT = prev;
  });
});

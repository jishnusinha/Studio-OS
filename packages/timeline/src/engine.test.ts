import { describe, expect, it } from 'vitest';
import type { Clip, Timeline, TimelineCommand } from '@studio-os/contracts';
import { TimelineEngine } from './engine.js';

const TRACK_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CLIP_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PROJECT_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const TIMELINE_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const ASSET_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

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

function baseTimeline(clips: Clip[] = [baseClip()]): Timeline {
  return {
    id: TIMELINE_ID,
    projectId: PROJECT_ID,
    name: 'Test',
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
        clips,
      },
    ],
  };
}

function cmd(
  type: TimelineCommand['type'],
  payload: Record<string, unknown>,
): TimelineCommand {
  return {
    id: crypto.randomUUID(),
    type,
    payload,
    timestamp: Date.now(),
    source: 'user',
  };
}

describe('TimelineEngine', () => {
  it('adds a clip', () => {
    const engine = new TimelineEngine(baseTimeline([]));
    const clip = baseClip();
    engine.apply(cmd('add_clip', { trackId: TRACK_ID, clip }));
    const state = engine.getState();
    expect(state.tracks[0]?.clips).toHaveLength(1);
    expect(state.tracks[0]?.clips[0]?.id).toBe(CLIP_ID);
  });

  it('blades a clip into two', () => {
    const engine = new TimelineEngine(baseTimeline());
    const rightId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    engine.apply(cmd('blade_clip', { clipId: CLIP_ID, atTime: 4, newClipId: rightId }));
    const clips = engine.getState().tracks[0]?.clips ?? [];
    expect(clips).toHaveLength(2);
    expect(clips[0]?.sourceOut).toBe(4);
    expect(clips[1]?.id).toBe(rightId);
    expect(clips[1]?.timelineStart).toBe(4);
    expect(clips[1]?.sourceIn).toBe(4);
  });

  it('undoes the last command', () => {
    const engine = new TimelineEngine(baseTimeline([]));
    engine.apply(cmd('add_clip', { trackId: TRACK_ID, clip: baseClip() }));
    expect(engine.canUndo).toBe(true);
    const undone = engine.undo();
    expect(undone?.tracks[0]?.clips).toHaveLength(0);
    expect(engine.canRedo).toBe(true);
  });

  it('sets color grade on clip effects', () => {
    const engine = new TimelineEngine(baseTimeline());
    engine.apply(
      cmd('set_color_grade', {
        clipId: CLIP_ID,
        grade: { brightness: 0.1, contrast: 1.2, lut: '/luts/teal.cube' },
      }),
    );
    const clip = engine.getState().tracks[0]?.clips[0];
    const grade = clip?.effects.find((e) => e.type === 'color_grade');
    expect(grade?.parameters).toMatchObject({ brightness: 0.1, contrast: 1.2 });
    engine.undo();
    expect(engine.getState().tracks[0]?.clips[0]?.effects).toHaveLength(0);
  });

  it('sets clip audio mute and volume', () => {
    const engine = new TimelineEngine(baseTimeline());
    engine.apply(cmd('set_clip_audio', { clipId: CLIP_ID, muted: true, volume: 0.5 }));
    const clip = engine.getState().tracks[0]?.clips[0];
    expect(clip?.muted).toBe(true);
    expect(clip?.effects.find((e) => e.type === 'audio_gain')?.parameters?.volume).toBe(0.5);
  });

  it('stores multicam angle on clip effects', () => {
    const engine = new TimelineEngine(baseTimeline());
    engine.apply(cmd('set_multicam_angle', { clipId: CLIP_ID, angle: 'B' }));
    const multicam = engine.getState().tracks[0]?.clips[0]?.effects.find((e) => e.type === 'multicam');
    expect(multicam?.parameters?.angle).toBe('B');
  });

  it('adds a mask effect', () => {
    const engine = new TimelineEngine(baseTimeline());
    engine.apply(
      cmd('add_mask', {
        clipId: CLIP_ID,
        mask: { shape: 'ellipse', feather: 12 },
      }),
    );
    const mask = engine.getState().tracks[0]?.clips[0]?.effects.find((e) => e.type === 'mask');
    expect(mask?.parameters).toMatchObject({ shape: 'ellipse', feather: 12 });
    engine.undo();
    expect(engine.getState().tracks[0]?.clips[0]?.effects).toHaveLength(0);
  });
});

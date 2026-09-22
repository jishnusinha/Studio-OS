import type { Clip, Timeline, Track } from '@studio-os/contracts';

function clipDuration(clip: Clip): number {
  return Math.max(0, (clip.sourceOut - clip.sourceIn) / (clip.speed || 1));
}

function clipEnd(clip: Clip): number {
  return clip.timelineStart + clipDuration(clip);
}

function frames(seconds: number, fps: number): number {
  return Math.round(seconds * fps);
}

function tc(seconds: number, fps: number): string {
  const total = Math.max(0, Math.floor(seconds * fps));
  const ff = total % fps;
  const ss = Math.floor(total / fps) % 60;
  const mm = Math.floor(total / (fps * 60)) % 60;
  const hh = Math.floor(total / (fps * 3600));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(hh)}:${pad(mm)}:${pad(ss)}:${pad(ff)}`;
}

export interface OtioRationalTime {
  OTIO_SCHEMA: 'RationalTime.1';
  value: number;
  rate: number;
}

export interface OtioTimeRange {
  OTIO_SCHEMA: 'TimeRange.1';
  start_time: OtioRationalTime;
  duration: OtioRationalTime;
}

export interface OtioExternalReference {
  OTIO_SCHEMA: 'ExternalReference.1';
  target_url: string;
  available_range?: OtioTimeRange | null;
}

export interface OtioClip {
  OTIO_SCHEMA: 'Clip.1';
  name: string;
  source_range: OtioTimeRange;
  media_reference: OtioExternalReference;
  metadata?: Record<string, unknown>;
}

export interface OtioGap {
  OTIO_SCHEMA: 'Gap.1';
  name: string;
  source_range: OtioTimeRange;
}

export interface OtioTrack {
  OTIO_SCHEMA: 'Track.1';
  name: string;
  kind: string;
  children: Array<OtioClip | OtioGap>;
}

export interface OtioStack {
  OTIO_SCHEMA: 'Stack.1';
  name: string;
  children: OtioTrack[];
}

/** Real OTIO-compatible JSON document (schema version 1). */
export interface OtioDocument {
  OTIO_SCHEMA: 'Timeline.1';
  name: string;
  global_start_time: OtioRationalTime | null;
  tracks: OtioStack;
  metadata: {
    studio_os: {
      timelineId: string;
      projectId: string;
      fps: number;
      width: number;
      height: number;
      version: number;
    };
  };
}

/** @deprecated Use OtioDocument / toOtio */
export type OtioStub = OtioDocument;

function rational(value: number, rate: number): OtioRationalTime {
  return { OTIO_SCHEMA: 'RationalTime.1', value, rate };
}

function range(startSec: number, durationSec: number, fps: number): OtioTimeRange {
  return {
    OTIO_SCHEMA: 'TimeRange.1',
    start_time: rational(frames(startSec, fps), fps),
    duration: rational(frames(durationSec, fps), fps),
  };
}

function trackKind(type: Track['type']): string {
  if (type === 'audio' || type === 'music' || type === 'sfx') return 'Audio';
  return 'Video';
}

function buildTrackChildren(track: Track, fps: number): Array<OtioClip | OtioGap> {
  const clips = [...track.clips].sort((a, b) => a.timelineStart - b.timelineStart);
  const children: Array<OtioClip | OtioGap> = [];
  let cursor = 0;

  for (const clip of clips) {
    if (clip.timelineStart > cursor + 1e-6) {
      const gapDur = clip.timelineStart - cursor;
      children.push({
        OTIO_SCHEMA: 'Gap.1',
        name: 'gap',
        source_range: range(0, gapDur, fps),
      });
    }
    const dur = clipDuration(clip);
    children.push({
      OTIO_SCHEMA: 'Clip.1',
      name: clip.label ?? clip.id,
      source_range: range(clip.sourceIn, clip.sourceOut - clip.sourceIn, fps),
      media_reference: {
        OTIO_SCHEMA: 'ExternalReference.1',
        target_url: `asset://${clip.assetId}`,
        available_range: range(clip.sourceIn, clip.sourceOut - clip.sourceIn, fps),
      },
      metadata: {
        studio_os: {
          clipId: clip.id,
          assetId: clip.assetId,
          timelineStart: clip.timelineStart,
          duration: dur,
          speed: clip.speed,
          linkedAudioClipId: clip.linkedAudioClipId ?? null,
          muted: clip.muted,
          transform: clip.transform,
          effects: clip.effects,
          keyframes: clip.keyframes,
          colorGrade: clip.effects.find((e) => e.type === 'color_grade')?.parameters ?? null,
          multicamAngle:
            clip.effects.find((e) => e.type === 'multicam')?.parameters?.angle ?? null,
          masks: clip.effects.filter((e) => e.type === 'mask').map((e) => e.parameters),
          audioGain: clip.effects.find((e) => e.type === 'audio_gain')?.parameters ?? null,
        },
      },
    });
    cursor = Math.max(cursor, clipEnd(clip));
  }

  return children;
}

export function toOtio(timeline: Timeline): OtioDocument {
  const fps = timeline.fps || 24;
  return {
    OTIO_SCHEMA: 'Timeline.1',
    name: timeline.name,
    global_start_time: rational(0, fps),
    tracks: {
      OTIO_SCHEMA: 'Stack.1',
      name: 'tracks',
      children: timeline.tracks.map((track) => ({
        OTIO_SCHEMA: 'Track.1',
        name: track.name,
        kind: trackKind(track.type),
        children: buildTrackChildren(track, fps),
      })),
    },
    metadata: {
      studio_os: {
        timelineId: timeline.id,
        projectId: timeline.projectId,
        fps,
        width: timeline.width,
        height: timeline.height,
        version: timeline.version,
      },
    },
  };
}

/** @deprecated Prefer toOtio */
export function toOtioStub(timeline: Timeline): OtioDocument {
  return toOtio(timeline);
}

/** CMX 3600-style EDL text from the first video track. */
export function toEdl(timeline: Timeline): string {
  const fps = timeline.fps || 24;
  const track = timeline.tracks.find((t) => t.type === 'video') ?? timeline.tracks[0];
  const lines: string[] = [
    `TITLE: ${timeline.name}`,
    'FCM: NON-DROP FRAME',
    '',
  ];

  if (!track) return lines.join('\n');

  const clips = [...track.clips].sort((a, b) => a.timelineStart - b.timelineStart);
  let event = 1;
  for (const clip of clips) {
    const dur = clipDuration(clip);
    const srcIn = tc(clip.sourceIn, fps);
    const srcOut = tc(clip.sourceOut, fps);
    const recIn = tc(clip.timelineStart, fps);
    const recOut = tc(clip.timelineStart + dur, fps);
    lines.push(
      `${String(event).padStart(3, '0')}  AX       V     C        ${srcIn} ${srcOut} ${recIn} ${recOut}`,
    );
    lines.push(`* FROM CLIP NAME: ${clip.label ?? clip.id}`);
    lines.push(`* SOURCE FILE: asset://${clip.assetId}`);
    lines.push('');
    event += 1;
  }

  return lines.join('\n');
}

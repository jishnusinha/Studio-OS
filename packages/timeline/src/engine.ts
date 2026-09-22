import type { Clip, Timeline, TimelineCommand, Transform } from '@studio-os/contracts';

function clipDuration(clip: Clip): number {
  return Math.max(0, (clip.sourceOut - clip.sourceIn) / (clip.speed || 1));
}

function clipEnd(clip: Clip): number {
  return clip.timelineStart + clipDuration(clip);
}

function recomputeDuration(timeline: Timeline): Timeline {
  let maxEnd = 0;
  for (const track of timeline.tracks) {
    for (const clip of track.clips) {
      maxEnd = Math.max(maxEnd, clipEnd(clip));
    }
  }
  return { ...timeline, duration: maxEnd, version: timeline.version + 1 };
}

function findTrackIndex(timeline: Timeline, trackId: string): number {
  return timeline.tracks.findIndex((t) => t.id === trackId);
}

function findClip(
  timeline: Timeline,
  clipId: string,
): { trackIndex: number; clipIndex: number; clip: Clip } | null {
  for (let trackIndex = 0; trackIndex < timeline.tracks.length; trackIndex++) {
    const track = timeline.tracks[trackIndex]!;
    const clipIndex = track.clips.findIndex((c) => c.id === clipId);
    if (clipIndex >= 0) {
      return { trackIndex, clipIndex, clip: track.clips[clipIndex]! };
    }
  }
  return null;
}

function updateTrackClips(
  timeline: Timeline,
  trackIndex: number,
  clips: Clip[],
): Timeline {
  const tracks = timeline.tracks.map((track, i) =>
    i === trackIndex ? { ...track, clips } : track,
  );
  return recomputeDuration({ ...timeline, tracks });
}

function applySingle(timeline: Timeline, command: TimelineCommand): Timeline {
  const { type, payload } = command;

  switch (type) {
    case 'add_clip': {
      const trackId = payload.trackId as string;
      const clip = payload.clip as Clip;
      const trackIndex = findTrackIndex(timeline, trackId);
      if (trackIndex < 0) return timeline;
      const track = timeline.tracks[trackIndex]!;
      return updateTrackClips(timeline, trackIndex, [...track.clips, structuredClone(clip)]);
    }

    case 'remove_clip': {
      const clipId = payload.clipId as string;
      const found = findClip(timeline, clipId);
      if (!found) return timeline;
      const track = timeline.tracks[found.trackIndex]!;
      const clips = track.clips.filter((c) => c.id !== clipId);
      return updateTrackClips(timeline, found.trackIndex, clips);
    }

    case 'move_clip': {
      const clipId = payload.clipId as string;
      const timelineStart = payload.timelineStart as number;
      const targetTrackId = payload.trackId as string | undefined;
      const found = findClip(timeline, clipId);
      if (!found) return timeline;

      let next = structuredClone(timeline);
      const fromTrack = next.tracks[found.trackIndex]!;
      const [moved] = fromTrack.clips.splice(found.clipIndex, 1);
      if (!moved) return timeline;

      const updated: Clip = { ...moved, timelineStart };
      const destTrackIndex =
        targetTrackId != null ? findTrackIndex(next, targetTrackId) : found.trackIndex;
      if (destTrackIndex < 0) return timeline;
      next.tracks[destTrackIndex]!.clips.push(updated);
      return recomputeDuration(next);
    }

    case 'trim_clip': {
      const clipId = payload.clipId as string;
      const found = findClip(timeline, clipId);
      if (!found) return timeline;
      const track = timeline.tracks[found.trackIndex]!;
      const clips = track.clips.map((c) => {
        if (c.id !== clipId) return c;
        return {
          ...c,
          sourceIn: (payload.sourceIn as number | undefined) ?? c.sourceIn,
          sourceOut: (payload.sourceOut as number | undefined) ?? c.sourceOut,
          timelineStart: (payload.timelineStart as number | undefined) ?? c.timelineStart,
        };
      });
      return updateTrackClips(timeline, found.trackIndex, clips);
    }

    case 'blade_clip': {
      const clipId = payload.clipId as string;
      const atTime = payload.atTime as number;
      const found = findClip(timeline, clipId);
      if (!found) return timeline;
      const { clip } = found;
      const start = clip.timelineStart;
      const end = clipEnd(clip);
      if (atTime <= start || atTime >= end) return timeline;

      const elapsed = atTime - start;
      const sourceDelta = elapsed * (clip.speed || 1);
      const splitSource = clip.sourceIn + sourceDelta;

      const left: Clip = {
        ...structuredClone(clip),
        sourceOut: splitSource,
      };
      const right: Clip = {
        ...structuredClone(clip),
        id: (payload.newClipId as string | undefined) ?? crypto.randomUUID(),
        sourceIn: splitSource,
        timelineStart: atTime,
      };

      const track = timeline.tracks[found.trackIndex]!;
      const clips = [
        ...track.clips.slice(0, found.clipIndex),
        left,
        right,
        ...track.clips.slice(found.clipIndex + 1),
      ];
      return updateTrackClips(timeline, found.trackIndex, clips);
    }

    case 'ripple_delete': {
      const clipId = payload.clipId as string;
      const found = findClip(timeline, clipId);
      if (!found) return timeline;
      const removed = found.clip;
      const duration = clipDuration(removed);
      const track = timeline.tracks[found.trackIndex]!;
      const clips = track.clips
        .filter((c) => c.id !== clipId)
        .map((c) => {
          if (c.timelineStart > removed.timelineStart) {
            return { ...c, timelineStart: Math.max(0, c.timelineStart - duration) };
          }
          return c;
        });
      return updateTrackClips(timeline, found.trackIndex, clips);
    }

    case 'set_transform': {
      const clipId = payload.clipId as string;
      const transform = payload.transform as Partial<Transform>;
      const found = findClip(timeline, clipId);
      if (!found) return timeline;
      const track = timeline.tracks[found.trackIndex]!;
      const clips = track.clips.map((c) =>
        c.id === clipId ? { ...c, transform: { ...c.transform, ...transform } } : c,
      );
      return updateTrackClips(timeline, found.trackIndex, clips);
    }

    case 'add_marker': {
      const marker = payload.marker as Timeline['markers'][number];
      return recomputeDuration({
        ...timeline,
        markers: [...timeline.markers, structuredClone(marker)],
      });
    }

    case 'remove_marker': {
      const markerId = payload.markerId as string;
      return recomputeDuration({
        ...timeline,
        markers: timeline.markers.filter((m) => m.id !== markerId),
      });
    }

    case 'add_effect': {
      const clipId = payload.clipId as string;
      const effect = payload.effect as Clip['effects'][number];
      const found = findClip(timeline, clipId);
      if (!found) return timeline;
      const track = timeline.tracks[found.trackIndex]!;
      const clips = track.clips.map((c) =>
        c.id === clipId ? { ...c, effects: [...c.effects, structuredClone(effect)] } : c,
      );
      return updateTrackClips(timeline, found.trackIndex, clips);
    }

    case 'remove_effect': {
      const clipId = payload.clipId as string;
      const effectId = payload.effectId as string;
      const found = findClip(timeline, clipId);
      if (!found) return timeline;
      const track = timeline.tracks[found.trackIndex]!;
      const clips = track.clips.map((c) =>
        c.id === clipId
          ? { ...c, effects: c.effects.filter((e) => e.id !== effectId) }
          : c,
      );
      return updateTrackClips(timeline, found.trackIndex, clips);
    }

    case 'add_keyframe': {
      const clipId = payload.clipId as string;
      const keyframe = payload.keyframe as Clip['keyframes'][number];
      const found = findClip(timeline, clipId);
      if (!found) return timeline;
      const track = timeline.tracks[found.trackIndex]!;
      const clips = track.clips.map((c) =>
        c.id === clipId
          ? { ...c, keyframes: [...c.keyframes, structuredClone(keyframe)] }
          : c,
      );
      return updateTrackClips(timeline, found.trackIndex, clips);
    }

    case 'set_track_mute': {
      const trackId = payload.trackId as string;
      const muted = payload.muted as boolean;
      const tracks = timeline.tracks.map((t) =>
        t.id === trackId ? { ...t, muted } : t,
      );
      return recomputeDuration({ ...timeline, tracks });
    }

    case 'set_color_grade': {
      const clipId = payload.clipId as string;
      const found = findClip(timeline, clipId);
      if (!found) return timeline;
      const parameters = (payload.grade ?? payload.parameters ?? {}) as Record<string, unknown>;
      const effectId =
        (payload.effectId as string | undefined) ??
        found.clip.effects.find((e) => e.type === 'color_grade')?.id ??
        crypto.randomUUID();
      const track = timeline.tracks[found.trackIndex]!;
      const clips = track.clips.map((c) => {
        if (c.id !== clipId) return c;
        const without = c.effects.filter((e) => e.type !== 'color_grade');
        return {
          ...c,
          effects: [
            ...without,
            {
              id: effectId,
              type: 'color_grade',
              enabled: (payload.enabled as boolean | undefined) ?? true,
              parameters,
            },
          ],
        };
      });
      return updateTrackClips(timeline, found.trackIndex, clips);
    }

    case 'set_clip_audio': {
      const clipId = payload.clipId as string;
      const found = findClip(timeline, clipId);
      if (!found) return timeline;
      const track = timeline.tracks[found.trackIndex]!;
      const clips = track.clips.map((c) => {
        if (c.id !== clipId) return c;
        let effects = c.effects;
        if (payload.volume != null) {
          const volume = Number(payload.volume);
          const existing = effects.find((e) => e.type === 'audio_gain');
          const effectId = existing?.id ?? crypto.randomUUID();
          effects = [
            ...effects.filter((e) => e.type !== 'audio_gain'),
            {
              id: effectId,
              type: 'audio_gain',
              enabled: true,
              parameters: { volume },
            },
          ];
        }
        return {
          ...c,
          muted: (payload.muted as boolean | undefined) ?? c.muted,
          effects,
        };
      });
      return updateTrackClips(timeline, found.trackIndex, clips);
    }

    case 'set_multicam_angle': {
      const clipId = payload.clipId as string;
      const found = findClip(timeline, clipId);
      if (!found) return timeline;
      const angle = payload.angle;
      const effectId =
        (payload.effectId as string | undefined) ??
        found.clip.effects.find((e) => e.type === 'multicam')?.id ??
        crypto.randomUUID();
      const track = timeline.tracks[found.trackIndex]!;
      const clips = track.clips.map((c) => {
        if (c.id !== clipId) return c;
        return {
          ...c,
          effects: [
            ...c.effects.filter((e) => e.type !== 'multicam'),
            {
              id: effectId,
              type: 'multicam',
              enabled: true,
              parameters: {
                angle,
                ...(typeof payload.metadata === 'object' && payload.metadata
                  ? (payload.metadata as Record<string, unknown>)
                  : {}),
              },
            },
          ],
        };
      });
      return updateTrackClips(timeline, found.trackIndex, clips);
    }

    case 'add_mask': {
      const clipId = payload.clipId as string;
      const found = findClip(timeline, clipId);
      if (!found) return timeline;
      const mask = (payload.mask ?? payload.parameters ?? {}) as Record<string, unknown>;
      const effect = {
        id: (payload.effectId as string | undefined) ?? crypto.randomUUID(),
        type: 'mask',
        enabled: (payload.enabled as boolean | undefined) ?? true,
        parameters: mask,
      };
      const track = timeline.tracks[found.trackIndex]!;
      const clips = track.clips.map((c) =>
        c.id === clipId ? { ...c, effects: [...c.effects, effect] } : c,
      );
      return updateTrackClips(timeline, found.trackIndex, clips);
    }

    case 'batch': {
      const commands = (payload.commands as TimelineCommand[] | undefined) ?? [];
      let next = timeline;
      for (const sub of commands) {
        next = applySingle(next, sub);
      }
      return next;
    }

    default:
      return timeline;
  }
}

function replay(initial: Timeline, commands: TimelineCommand[]): Timeline {
  let state = structuredClone(initial);
  for (const command of commands) {
    state = applySingle(state, command);
  }
  return state;
}

export class TimelineEngine {
  private readonly initial: Timeline;
  private current: Timeline;
  private undoStack: TimelineCommand[] = [];
  private redoStack: TimelineCommand[] = [];

  constructor(timeline: Timeline) {
    this.initial = structuredClone(timeline);
    this.current = structuredClone(timeline);
  }

  getState(): Timeline {
    return structuredClone(this.current);
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  apply(command: TimelineCommand): Timeline {
    this.current = applySingle(structuredClone(this.current), command);
    this.undoStack.push(structuredClone(command));
    this.redoStack = [];
    return this.getState();
  }

  undo(): Timeline | null {
    if (!this.canUndo) return null;
    const command = this.undoStack.pop()!;
    this.redoStack.push(command);
    this.current = replay(this.initial, this.undoStack);
    return this.getState();
  }

  redo(): Timeline | null {
    if (!this.canRedo) return null;
    const command = this.redoStack.pop()!;
    this.current = applySingle(structuredClone(this.current), command);
    this.undoStack.push(command);
    return this.getState();
  }
}

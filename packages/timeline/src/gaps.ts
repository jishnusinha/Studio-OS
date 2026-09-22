import type { Clip, Timeline } from '@studio-os/contracts';

export interface Gap {
  start: number;
  end: number;
  duration: number;
}

export interface GapNeighbors {
  previous: Clip | null;
  next: Clip | null;
}

export interface GenerateIntoGapContext {
  timelineId: string;
  projectId: string;
  trackId: string;
  gap: Gap;
  neighbors: GapNeighbors;
  fps: number;
  width: number;
  height: number;
}

function clipDuration(clip: Clip): number {
  return Math.max(0, (clip.sourceOut - clip.sourceIn) / (clip.speed || 1));
}

function clipEnd(clip: Clip): number {
  return clip.timelineStart + clipDuration(clip);
}

export function findGaps(timeline: Timeline, trackId: string): Gap[] {
  const track = timeline.tracks.find((t) => t.id === trackId);
  if (!track) return [];

  const sorted = [...track.clips].sort((a, b) => a.timelineStart - b.timelineStart);
  const gaps: Gap[] = [];
  let cursor = 0;

  for (const clip of sorted) {
    if (clip.timelineStart > cursor) {
      const start = cursor;
      const end = clip.timelineStart;
      gaps.push({ start, end, duration: end - start });
    }
    cursor = Math.max(cursor, clipEnd(clip));
  }

  return gaps;
}

export function buildGenerateIntoGapContext(
  timeline: Timeline,
  trackId: string,
  gap: Gap,
  neighbors: GapNeighbors,
): GenerateIntoGapContext {
  return {
    timelineId: timeline.id,
    projectId: timeline.projectId,
    trackId,
    gap: { ...gap },
    neighbors: {
      previous: neighbors.previous ? structuredClone(neighbors.previous) : null,
      next: neighbors.next ? structuredClone(neighbors.next) : null,
    },
    fps: timeline.fps,
    width: timeline.width,
    height: timeline.height,
  };
}

/** Convenience: resolve neighbors for a gap on a track. */
export function neighborsForGap(
  timeline: Timeline,
  trackId: string,
  gap: Gap,
): GapNeighbors {
  const track = timeline.tracks.find((t) => t.id === trackId);
  if (!track) return { previous: null, next: null };

  const sorted = [...track.clips].sort((a, b) => a.timelineStart - b.timelineStart);
  let previous: Clip | null = null;
  let next: Clip | null = null;

  for (const clip of sorted) {
    if (clipEnd(clip) <= gap.start) {
      previous = clip;
    } else if (clip.timelineStart >= gap.end && next == null) {
      next = clip;
      break;
    }
  }

  return { previous, next };
}

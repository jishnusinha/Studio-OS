'use client';

import { useParams } from 'next/navigation';
import { useCallback } from 'react';
import { TimelineEditor } from './editor/TimelineEditor';
import { useStudioStore } from '@/lib/store';
import type { TimelineDto } from '@/lib/api';

/** Dock wrapper — real NLE timeline wired to project timelines API. */
export function TimelineDock() {
  const params = useParams<{ id?: string }>();
  const projectId = params?.id ?? null;
  const setTimelinePlayhead = useStudioStore((s) => s.setTimelinePlayhead);
  const setActiveTimeline = useStudioStore((s) => s.setActiveTimeline);

  const onPlayheadChange = useCallback(
    (t: number) => setTimelinePlayhead(t),
    [setTimelinePlayhead],
  );
  const onTimelineChange = useCallback(
    (t: TimelineDto | null) => setActiveTimeline(t),
    [setActiveTimeline],
  );

  return (
    <TimelineEditor
      projectId={projectId}
      compact
      onPlayheadChange={onPlayheadChange}
      onTimelineChange={onTimelineChange}
    />
  );
}

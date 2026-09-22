'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  timelinesApi,
  type TimelineCommandDto,
  type TimelineDto,
} from '@/lib/api';
import { useStudioStore } from '@/lib/store';
import { formatTc } from './ProgramMonitor';

type Tool = 'select' | 'blade' | 'trim';
type EditMode = 'insert' | 'overwrite' | 'replace';

const PX_PER_SEC = 48;
const SNAP_THRESHOLD = 0.15;
const TRACK_ROW_H = 22;
const LABEL_W = 52;

function clipDur(clip: TimelineDto['tracks'][0]['clips'][0]): number {
  return Math.max(0, (clip.sourceOut - clip.sourceIn) / (clip.speed || 1));
}

function makeCommand(
  type: TimelineCommandDto['type'],
  payload: Record<string, unknown>,
): TimelineCommandDto {
  return {
    id: crypto.randomUUID(),
    type,
    payload,
    timestamp: Date.now(),
    source: 'user',
  };
}

function snapTime(t: number, points: number[], enabled: boolean): number {
  if (!enabled) return Math.max(0, t);
  let best = t;
  let bestDist = SNAP_THRESHOLD;
  for (const p of points) {
    const d = Math.abs(p - t);
    if (d < bestDist) {
      bestDist = d;
      best = p;
    }
  }
  return Math.max(0, best);
}

export function TimelineEditor({
  projectId,
  compact = false,
  onPlayheadChange,
  onTimelineChange,
}: {
  projectId?: string | null;
  compact?: boolean;
  onPlayheadChange?: (t: number) => void;
  onTimelineChange?: (t: TimelineDto | null) => void;
}) {
  const selectShot = useStudioStore((s) => s.selectShot);
  const queryClient = useQueryClient();
  const [timelineId, setTimelineId] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>('select');
  const [editMode, setEditMode] = useState<EditMode>('overwrite');
  const [snap, setSnap] = useState(true);
  const [linkedAV, setLinkedAV] = useState(true);
  const [playhead, setPlayhead] = useState(0);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [viewportW, setViewportW] = useState(800);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ clipId: string; startX: number; origStart: number } | null>(null);

  const listQuery = useQuery({
    queryKey: ['timelines', projectId],
    queryFn: () => timelinesApi.list(projectId!),
    enabled: Boolean(projectId),
  });

  useEffect(() => {
    const rows = (listQuery.data ?? []) as Array<{ id: string; name?: string }>;
    if (!timelineId && rows[0]) setTimelineId(rows[0].id);
  }, [listQuery.data, timelineId]);

  const createMutation = useMutation({
    mutationFn: () => timelinesApi.create(projectId!, { name: 'Sequence 1' }),
    onSuccess: (row) => {
      const id = (row as { id: string }).id;
      setTimelineId(id);
      queryClient.invalidateQueries({ queryKey: ['timelines', projectId] });
    },
  });

  const timelineQuery = useQuery({
    queryKey: ['timeline', timelineId],
    queryFn: () => timelinesApi.get(timelineId!),
    enabled: Boolean(timelineId),
  });

  const timeline = timelineQuery.data?.timeline ?? null;

  useEffect(() => {
    if (timelineQuery.data) {
      setCanUndo(Boolean(timelineQuery.data.canUndo));
      setCanRedo(Boolean(timelineQuery.data.canRedo));
    }
    onTimelineChange?.(timeline);
  }, [timelineQuery.data, timeline, onTimelineChange]);

  useEffect(() => {
    onPlayheadChange?.(playhead);
  }, [playhead, onPlayheadChange]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewportW(el.clientWidth));
    ro.observe(el);
    setViewportW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const commandMutation = useMutation({
    mutationFn: (cmd: TimelineCommandDto) => timelinesApi.command(timelineId!, cmd),
    onSuccess: (res) => {
      setCanUndo(Boolean(res.canUndo ?? true));
      setCanRedo(Boolean(res.canRedo ?? false));
      queryClient.setQueryData(['timeline', timelineId], (prev: unknown) => ({
        ...(typeof prev === 'object' && prev ? prev : {}),
        timeline: res.timeline,
        canUndo: res.canUndo,
        canRedo: res.canRedo,
      }));
    },
  });

  const undoMutation = useMutation({
    mutationFn: () => timelinesApi.undo(timelineId!),
    onSuccess: (res) => {
      setCanUndo(Boolean(res.canUndo));
      setCanRedo(Boolean(res.canRedo));
      queryClient.setQueryData(['timeline', timelineId], (prev: unknown) => ({
        ...(typeof prev === 'object' && prev ? prev : {}),
        timeline: res.timeline,
        canUndo: res.canUndo,
        canRedo: res.canRedo,
      }));
    },
  });

  const redoMutation = useMutation({
    mutationFn: () => timelinesApi.redo(timelineId!),
    onSuccess: (res) => {
      setCanUndo(Boolean(res.canUndo));
      setCanRedo(Boolean(res.canRedo));
      queryClient.setQueryData(['timeline', timelineId], (prev: unknown) => ({
        ...(typeof prev === 'object' && prev ? prev : {}),
        timeline: res.timeline,
        canUndo: res.canUndo,
        canRedo: res.canRedo,
      }));
    },
  });

  const send = useCallback(
    (cmd: TimelineCommandDto) => {
      if (!timelineId) return;
      commandMutation.mutate(cmd);
    },
    [timelineId, commandMutation],
  );

  const duration = Math.max(timeline?.duration ?? 30, 30);
  const contentW = duration * PX_PER_SEC + 200;

  // Simple CSS overflow virtualization: only render clips intersecting viewport
  const viewStart = scrollLeft / PX_PER_SEC - 2;
  const viewEnd = (scrollLeft + viewportW) / PX_PER_SEC + 2;

  const snapPoints = useMemo(() => {
    const pts = [0, playhead];
    if (!timeline) return pts;
    for (const m of timeline.markers) pts.push(m.time);
    for (const track of timeline.tracks) {
      for (const clip of track.clips) {
        pts.push(clip.timelineStart, clip.timelineStart + clipDur(clip));
      }
    }
    return pts;
  }, [timeline, playhead]);

  const onTrackClick = (e: React.MouseEvent, trackId: string) => {
    if (!timeline) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left + scrollLeft;
    const t = snapTime(x / PX_PER_SEC, snapPoints, snap);
    setPlayhead(t);

    if (tool === 'blade' && selectedClipId) {
      send(makeCommand('blade_clip', { clipId: selectedClipId, atTime: t, newClipId: crypto.randomUUID() }));
      return;
    }

    // Select clip under click
    const track = timeline.tracks.find((tr) => tr.id === trackId);
    if (!track) return;
    for (const clip of track.clips) {
      const end = clip.timelineStart + clipDur(clip);
      if (t >= clip.timelineStart && t < end) {
        setSelectedClipId(clip.id);
        selectShot(clip.id, clip.label ?? clip.id, { assetId: clip.assetId });
        return;
      }
    }
  };

  const onClipPointerDown = (e: React.PointerEvent, clipId: string, timelineStart: number) => {
    if (tool !== 'select' && tool !== 'trim') return;
    e.stopPropagation();
    setSelectedClipId(clipId);
    dragRef.current = { clipId, startX: e.clientX, origStart: timelineStart };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const onClipPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current || tool !== 'select') return;
    // Visual only until pointer up — apply on up
    void e;
  };

  const onClipPointerUp = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const { clipId, startX, origStart } = dragRef.current;
    dragRef.current = null;
    const dx = e.clientX - startX;
    const dt = dx / PX_PER_SEC;
    if (Math.abs(dt) < 0.05) return;
    const nextStart = snapTime(origStart + dt, snapPoints.filter((p) => p !== origStart), snap);

    if (tool === 'trim') {
      const clip = timeline?.tracks.flatMap((t) => t.clips).find((c) => c.id === clipId);
      if (!clip) return;
      const edge = dx < 0 ? 'in' : 'out';
      if (edge === 'in') {
        send(
          makeCommand('trim_clip', {
            clipId,
            sourceIn: Math.max(0, clip.sourceIn + dt),
            timelineStart: nextStart,
          }),
        );
      } else {
        send(
          makeCommand('trim_clip', {
            clipId,
            sourceOut: Math.max(clip.sourceIn + 0.1, clip.sourceOut + dt),
          }),
        );
      }
      return;
    }

    const payload: Record<string, unknown> = { clipId, timelineStart: nextStart };
    if (linkedAV && timeline) {
      const clip = timeline.tracks.flatMap((t) => t.clips).find((c) => c.id === clipId);
      if (clip?.linkedAudioClipId) {
        send(
          makeCommand('batch', {
            commands: [
              makeCommand('move_clip', payload),
              makeCommand('move_clip', {
                clipId: clip.linkedAudioClipId,
                timelineStart: nextStart,
              }),
            ],
          }),
        );
        return;
      }
    }
    send(makeCommand('move_clip', payload));
  };

  const rippleDelete = () => {
    if (!selectedClipId) return;
    send(makeCommand('ripple_delete', { clipId: selectedClipId }));
    setSelectedClipId(null);
  };

  const addMarker = () => {
    send(
      makeCommand('add_marker', {
        marker: {
          id: crypto.randomUUID(),
          time: playhead,
          label: `M${(timeline?.markers.length ?? 0) + 1}`,
          color: '#6ee7b7',
        },
      }),
    );
  };

  const generateGap = async () => {
    if (!timelineId || !timeline) return;
    const track = timeline.tracks.find((t) => t.type === 'video');
    if (!track) return;
    await timelinesApi.generateGap(timelineId, track.id, { gapIndex: 0 });
  };

  // NLE hotkeys: J/K/L, I/O markers, S blade, Delete ripple
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return;
      if (e.key === 'j' || e.key === 'J') setPlayhead((t) => Math.max(0, t - 1 / (timeline?.fps ?? 24)));
      if (e.key === 'l' || e.key === 'L') setPlayhead((t) => t + 1 / (timeline?.fps ?? 24));
      if (e.key === 'k' || e.key === 'K') {/* pause placeholder */}
      if (e.key === 's' || e.key === 'S') setTool('blade');
      if (e.key === 'i' || e.key === 'I') {
        send(makeCommand('add_marker', { marker: { id: crypto.randomUUID(), time: playhead, label: 'In', color: '#6ee7b7' } }));
      }
      if (e.key === 'o' || e.key === 'O') {
        send(makeCommand('add_marker', { marker: { id: crypto.randomUUID(), time: playhead, label: 'Out', color: '#fbbf24' } }));
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedClipId) {
          e.preventDefault();
          send(makeCommand('ripple_delete', { clipId: selectedClipId }));
          setSelectedClipId(null);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [timeline?.fps, playhead, selectedClipId, send]);

  const height = compact ? 148 : 220;

  if (!projectId) {
    return (
      <div className="h-[80px] border-t border-cinema-border flex items-center justify-center text-[12px] text-cinema-muted">
        Open a project to edit timeline
      </div>
    );
  }

  if (!timelineId && !listQuery.isLoading) {
    return (
      <div
        className="border-t border-cinema-border bg-[#0d1014] flex items-center justify-center gap-3"
        style={{ height }}
      >
        <span className="text-[12px] text-cinema-muted">No timeline yet</span>
        <button
          type="button"
          className="px-2.5 py-1 text-[12px] rounded border border-cinema-border hover:border-cinema-accent"
          onClick={() => createMutation.mutate()}
        >
          Create timeline
        </button>
      </div>
    );
  }

  return (
    <div
      className="border-t border-cinema-border bg-[#0d1014] relative select-none flex flex-col"
      style={{ height }}
    >
      <div className="h-7 px-2 flex items-center justify-between border-b border-cinema-border/80 gap-2 shrink-0">
        <div className="flex items-center gap-1.5 text-[11px] text-cinema-muted min-w-0">
          <span className="font-semibold text-cinema-text tracking-wide shrink-0">Timeline</span>
          <span className="font-mono shrink-0">{formatTc(playhead, timeline?.fps ?? 24)}</span>
          <span className="text-cinema-border-strong">|</span>
          <span className="truncate">{timeline?.name ?? '…'} · {editMode}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {(['select', 'blade', 'trim'] as Tool[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTool(t)}
              className={clsx(
                'px-1.5 py-0.5 rounded text-[10px] uppercase',
                tool === t ? 'bg-cinema-accent/20 text-cinema-accent' : 'hover:bg-cinema-raised',
              )}
            >
              {t}
            </button>
          ))}
          <select
            value={editMode}
            onChange={(e) => setEditMode(e.target.value as EditMode)}
            className="bg-cinema-bg border border-cinema-border rounded text-[10px] px-1 py-0.5"
          >
            <option value="insert">Insert</option>
            <option value="overwrite">Overwrite</option>
            <option value="replace">Replace</option>
          </select>
          <label className="flex items-center gap-1 text-[10px]">
            <input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} />
            Snap
          </label>
          <label className="flex items-center gap-1 text-[10px]">
            <input
              type="checkbox"
              checked={linkedAV}
              onChange={(e) => setLinkedAV(e.target.checked)}
            />
            Linked A/V
          </label>
          <button
            type="button"
            disabled={!canUndo}
            onClick={() => undoMutation.mutate()}
            className="px-1.5 py-0.5 text-[10px] disabled:opacity-40"
          >
            Undo
          </button>
          <button
            type="button"
            disabled={!canRedo}
            onClick={() => redoMutation.mutate()}
            className="px-1.5 py-0.5 text-[10px] disabled:opacity-40"
          >
            Redo
          </button>
          <button type="button" onClick={rippleDelete} className="px-1.5 py-0.5 text-[10px]">
            Ripple ⌫
          </button>
          <button type="button" onClick={addMarker} className="px-1.5 py-0.5 text-[10px]">
            Marker
          </button>
          <button type="button" onClick={() => void generateGap()} className="px-1.5 py-0.5 text-[10px] text-cinema-warning">
            Gap gen
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-auto relative"
        onScroll={(e) => setScrollLeft((e.target as HTMLDivElement).scrollLeft)}
      >
        <div className="relative" style={{ width: contentW, minHeight: '100%' }}>
          {/* Playhead */}
          <div
            className="absolute top-0 bottom-0 w-px bg-cinema-accent/80 z-20 pointer-events-none"
            style={{ left: LABEL_W + playhead * PX_PER_SEC }}
          />

          {/* Markers */}
          {(timeline?.markers ?? []).map((m) => (
            <div
              key={m.id}
              className="absolute top-0 bottom-0 w-px bg-amber-400/70 z-10 pointer-events-none"
              style={{ left: LABEL_W + m.time * PX_PER_SEC }}
              title={m.label}
            />
          ))}

          <div className="py-1.5 space-y-1">
            {(timeline?.tracks ?? []).map((track) => (
              <div key={track.id} className="flex items-center" style={{ height: TRACK_ROW_H }}>
                <div
                  className="shrink-0 px-2 text-[10px] font-mono text-cinema-muted"
                  style={{ width: LABEL_W }}
                >
                  {track.name}
                </div>
                <div
                  className="relative h-full rounded-sm bg-cinema-bg/60 border border-cinema-border/50"
                  style={{ width: contentW - LABEL_W }}
                  onClick={(e) => onTrackClick(e, track.id)}
                >
                  {track.clips
                    .filter((c) => {
                      const end = c.timelineStart + clipDur(c);
                      return end >= viewStart && c.timelineStart <= viewEnd;
                    })
                    .map((clip) => {
                      const dur = clipDur(clip);
                      const tone =
                        track.type === 'audio' || track.type === 'music'
                          ? 'audio'
                          : track.type === 'video'
                            ? 'video'
                            : 'other';
                      return (
                        <button
                          key={clip.id}
                          type="button"
                          onPointerDown={(e) => onClipPointerDown(e, clip.id, clip.timelineStart)}
                          onPointerMove={onClipPointerMove}
                          onPointerUp={onClipPointerUp}
                          className={clsx(
                            'absolute top-0 bottom-0 rounded-[2px] text-[9px] truncate px-1',
                            selectedClipId === clip.id && 'ring-1 ring-cinema-accent',
                            tone === 'audio'
                              ? 'bg-sky-500/25 border border-sky-400/30 text-sky-100'
                              : 'bg-cinema-accent/20 border border-cinema-accent/35 text-cinema-accent',
                          )}
                          style={{
                            left: clip.timelineStart * PX_PER_SEC,
                            width: Math.max(8, dur * PX_PER_SEC),
                          }}
                          title={clip.label ?? clip.id}
                        >
                          {clip.label ?? clip.id.slice(0, 6)}
                        </button>
                      );
                    })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

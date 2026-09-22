'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ComposedProgramMonitor } from '@/components/editor/ComposedProgramMonitor';
import { ClipInspector } from '@/components/editor/ClipInspector';
import { MediaBin } from '@/components/editor/MediaBin';
import { StorageModeChip } from '@/components/editor/StorageModeChip';
import {
  ProgramMonitor,
  clipAtPlayhead,
  formatTc,
  useProxyUrl,
} from '@/components/editor/ProgramMonitor';
import {
  timelinesApi,
  type AssetDto,
  type TimelineCommandDto,
  type TimelineDto,
} from '@/lib/api';
import { useStudioStore } from '@/lib/store';

const NIL_ASSET = '00000000-0000-4000-8000-000000000000';

export default function EditPage() {
  const params = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const timeline = useStudioStore((s) => s.activeTimeline) as TimelineDto | null;
  const playhead = useStudioStore((s) => s.timelinePlayhead);
  const setPlayhead = useStudioStore((s) => s.setTimelinePlayhead);
  const setActiveTimeline = useStudioStore((s) => s.setActiveTimeline);
  const [binAsset, setBinAsset] = useState<AssetDto | null>(null);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState<'insert' | 'overwrite' | 'replace'>('overwrite');

  const hit = useMemo(() => clipAtPlayhead(timeline, playhead), [timeline, playhead]);
  const programProxy = useProxyUrl(hit?.clip.assetId);
  const sourceProxy = useProxyUrl(binAsset?.id);

  useEffect(() => {
    if (hit?.clip.id) setSelectedClipId(hit.clip.id);
  }, [hit?.clip.id]);

  const renderMutation = useMutation({
    mutationFn: (preset: string) =>
      timelinesApi.render(timeline!.id, {
        preset,
        name: `${timeline?.name ?? 'Edit'} ${preset}`,
      }),
  });

  const commandMutation = useMutation({
    mutationFn: (cmd: TimelineCommandDto) => timelinesApi.command(timeline!.id, cmd),
    onSuccess: (res) => {
      queryClient.setQueryData(['timeline', timeline!.id], (prev: unknown) => ({
        ...(typeof prev === 'object' && prev ? prev : {}),
        timeline: res.timeline,
        canUndo: res.canUndo,
        canRedo: res.canRedo,
      }));
      setActiveTimeline(res.timeline);
    },
  });

  const send = useCallback(
    (cmd: TimelineCommandDto) => {
      if (!timeline?.id) return;
      commandMutation.mutate(cmd);
    },
    [timeline?.id, commandMutation],
  );

  const addAssetToTimeline = useCallback(
    (asset: AssetDto) => {
      if (!timeline) return;
      const videoTrack = timeline.tracks.find((t) => t.type === 'video') ?? timeline.tracks[0];
      if (!videoTrack) return;
      const duration =
        typeof asset.metadata?.durationSec === 'number' ? Number(asset.metadata.durationSec) : 5;
      const clipId = crypto.randomUUID();
      let timelineStart = playhead;

      if (editMode === 'replace' && hit) {
        send({
          id: crypto.randomUUID(),
          type: 'remove_clip',
          payload: { clipId: hit.clip.id },
          timestamp: Date.now(),
          source: 'user',
        });
        timelineStart = hit.clip.timelineStart;
      }

      const audioTrack = timeline.tracks.find((t) => t.type === 'audio');
      const audioClipId = audioTrack && asset.type === 'video' ? crypto.randomUUID() : null;

      const clip = {
        id: clipId,
        assetId: asset.id,
        sourceIn: 0,
        sourceOut: duration,
        timelineStart,
        speed: 1,
        effects: [],
        keyframes: [],
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 },
        muted: false,
        label: asset.name,
        linkedAudioClipId: audioClipId,
      };

      const commands: TimelineCommandDto[] = [
        {
          id: crypto.randomUUID(),
          type: 'add_clip',
          payload: { trackId: videoTrack.id, clip },
          timestamp: Date.now(),
          source: 'user',
        },
      ];

      if (audioTrack && audioClipId) {
        commands.push({
          id: crypto.randomUUID(),
          type: 'add_clip',
          payload: {
            trackId: audioTrack.id,
            clip: { ...clip, id: audioClipId, linkedAudioClipId: null, label: `${asset.name} (A)` },
          },
          timestamp: Date.now(),
          source: 'user',
        });
      }

      if (editMode === 'insert') {
        for (const c of videoTrack.clips) {
          if (c.timelineStart >= playhead) {
            commands.push({
              id: crypto.randomUUID(),
              type: 'move_clip',
              payload: { clipId: c.id, timelineStart: c.timelineStart + duration },
              timestamp: Date.now(),
              source: 'user',
            });
          }
        }
      }

      send({
        id: crypto.randomUUID(),
        type: 'batch',
        payload: { commands },
        timestamp: Date.now(),
        source: 'user',
      });
      setSelectedClipId(clipId);
    },
    [timeline, playhead, editMode, hit, send],
  );

  const addTitle = () => {
    if (!timeline) return;
    const titleTrack = timeline.tracks.find((t) => t.type === 'title');
    if (!titleTrack) return;
    const clipId = crypto.randomUUID();
    send({
      id: crypto.randomUUID(),
      type: 'add_clip',
      payload: {
        trackId: titleTrack.id,
        clip: {
          id: clipId,
          assetId: NIL_ASSET,
          sourceIn: 0,
          sourceOut: 3,
          timelineStart: playhead,
          speed: 1,
          effects: [],
          keyframes: [],
          transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 },
          muted: false,
          label: 'Title',
          title: {
            text: 'StudioOS',
            fontSize: 48,
            color: '#ffffff',
            x: 0.5,
            y: 0.85,
            align: 'center',
            preset: 'lower_third',
          },
        },
      },
      timestamp: Date.now(),
      source: 'user',
    });
    setSelectedClipId(clipId);
  };

  const duck = () => {
    if (!timeline) return;
    const dialogue = timeline.tracks.find((t) => t.type === 'audio');
    const music = timeline.tracks.find((t) => t.type === 'music') ?? dialogue;
    if (!dialogue || !music) return;
    send({
      id: crypto.randomUUID(),
      type: 'auto_duck',
      payload: { dialogueTrackId: dialogue.id, musicTrackId: music.id, duckTo: 0.25 },
      timestamp: Date.now(),
      source: 'user',
    });
  };

  const presets = ['16:9', '9:16', '1:1', '4:5', '2.39:1', '16:9_15s', '9:16_30s'];

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="border-b border-cinema-border px-4 py-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-[0.14em] text-cinema-muted font-semibold">Edit</div>
            <h1 className="text-[16px] font-semibold">Program monitor</h1>
          </div>
          <StorageModeChip />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {(['insert', 'overwrite', 'replace'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setEditMode(m)}
              className={`text-[10px] px-2 py-1 rounded border capitalize ${
                editMode === m ? 'border-cinema-accent text-cinema-accent' : 'border-cinema-border'
              }`}
            >
              {m}
            </button>
          ))}
          <button type="button" className="text-[10px] px-2 py-1 rounded border border-cinema-border" onClick={addTitle}>
            + Title
          </button>
          <button type="button" className="text-[10px] px-2 py-1 rounded border border-cinema-border" onClick={duck}>
            Auto-duck
          </button>
          {presets.map((p) => (
            <button
              key={p}
              type="button"
              disabled={!timeline?.id || renderMutation.isPending}
              onClick={() => renderMutation.mutate(p)}
              className="text-[10px] px-2 py-1 rounded border border-cinema-border hover:border-cinema-accent disabled:opacity-40"
            >
              Render {p}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[240px_1fr_260px] gap-3 p-3 overflow-hidden">
        <MediaBin
          projectId={params.id}
          selectedId={binAsset?.id ?? null}
          onSelect={setBinAsset}
          onAddToTimeline={addAssetToTimeline}
        />
        <div className="min-h-0 overflow-auto space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <div className="mb-1 text-[10px] uppercase tracking-[0.12em] text-cinema-muted">Source</div>
              <ProgramMonitor
                proxyUrl={sourceProxy}
                label={binAsset?.name ?? 'Select from bin'}
                timecode={formatTc(0, timeline?.fps ?? 24)}
              />
            </div>
            <div>
              <div className="mb-1 text-[10px] uppercase tracking-[0.12em] text-cinema-muted">Program</div>
              <ComposedProgramMonitor
                timeline={timeline}
                playhead={playhead}
                fallbackProxyUrl={programProxy}
                label={hit?.clip.label ?? hit?.clip.id}
                timecode={formatTc(playhead, timeline?.fps ?? 24)}
              />
            </div>
          </div>
          <input
            type="range"
            min={0}
            max={Math.max(timeline?.duration ?? 10, 10)}
            step={0.04}
            value={playhead}
            onChange={(e) => setPlayhead(Number(e.target.value))}
            className="w-full"
          />
        </div>
        <ClipInspector timeline={timeline} clipId={selectedClipId} onCommand={send} />
      </div>
    </div>
  );
}

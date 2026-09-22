'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  assetsApi,
  multicamApi,
  timelinesApi,
  type MulticamAngleDto,
  type MulticamGroupDto,
  type RotoShapeDto,
  type TimelineDto,
} from '@/lib/api';

type Point = { x: number; y: number };

function firstVideoClip(timeline?: TimelineDto | null) {
  if (!timeline) return null;
  for (const track of timeline.tracks) {
    if (track.type === 'video' || track.type === 'V') {
      if (track.clips[0]) return track.clips[0];
    }
  }
  for (const track of timeline.tracks) {
    if (track.clips[0]) return track.clips[0];
  }
  return null;
}

function AngleTile({
  angle,
  active,
  playing,
  currentTime,
  onSelect,
}: {
  angle: MulticamAngleDto;
  active: boolean;
  playing: boolean;
  currentTime: number;
  onSelect: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!angle.assetId) {
      setUrl(null);
      return;
    }
    let cancelled = false;
    void assetsApi.signedUrl(angle.assetId, 'proxy').then((r) => {
      if (!cancelled) setUrl(r.url);
    });
    return () => {
      cancelled = true;
    };
  }, [angle.assetId]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !url) return;
    const target = Math.max(0, currentTime + (angle.offsetSec ?? 0));
    if (Math.abs(el.currentTime - target) > 0.12) {
      try {
        el.currentTime = target;
      } catch {
        /* ignore seek errors on stub media */
      }
    }
    if (playing) void el.play().catch(() => undefined);
    else el.pause();
  }, [playing, currentTime, angle.offsetSec, url]);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={clsx(
        'text-left rounded-md border overflow-hidden bg-cinema-bg transition-colors',
        active ? 'border-cinema-accent ring-1 ring-cinema-accent/40' : 'border-cinema-border hover:border-cinema-accent/30',
      )}
    >
      <div className="aspect-video bg-black relative">
        {url ? (
          <video
            ref={videoRef}
            src={url}
            muted
            playsInline
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-[11px] text-cinema-muted">
            {angle.assetId ? 'Loading proxy…' : 'No asset'}
          </div>
        )}
        <div className="absolute left-1.5 top-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-mono text-white">
          {angle.label}
        </div>
      </div>
      <div className="px-2 py-1.5 text-[12px] truncate">{angle.name}</div>
    </button>
  );
}

function RotoCanvas({
  points,
  onChange,
}: {
  points: Point[];
  onChange: (pts: Point[]) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const w = 480;
  const h = 270;

  const path = useMemo(() => {
    if (points.length < 2) return '';
    return points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x * w} ${p.y * h}`)
      .concat(points.length > 2 ? ['Z'] : [])
      .join(' ');
  }, [points]);

  const addPoint = useCallback(
    (e: MouseEvent<SVGSVGElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
      onChange([...points, { x, y }]);
    },
    [onChange, points],
  );

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${w} ${h}`}
      className="w-full rounded-md border border-cinema-border bg-[#0d1014] cursor-crosshair"
      onClick={addPoint}
    >
      <rect width={w} height={h} fill="#0d1014" />
      {path && <path d={path} fill="rgba(110,231,183,0.12)" stroke="#6ee7b7" strokeWidth={2} />}
      {points.map((p, i) => (
        <circle
          key={i}
          cx={p.x * w}
          cy={p.y * h}
          r={5}
          fill="#6ee7b7"
          onClick={(ev) => {
            ev.stopPropagation();
            onChange(points.filter((_, j) => j !== i));
          }}
        />
      ))}
      {!points.length && (
        <text x={w / 2} y={h / 2} textAnchor="middle" fill="#64748b" fontSize={12}>
          Click to place bezier control points
        </text>
      )}
    </svg>
  );
}

export default function MulticamPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const qc = useQueryClient();

  const groupsQuery = useQuery({
    queryKey: ['multicam-groups', projectId],
    queryFn: () => multicamApi.listGroups(projectId),
  });
  const [groupId, setGroupId] = useState<string>('');
  useEffect(() => {
    if (!groupId && groupsQuery.data?.[0]?.id) setGroupId(groupsQuery.data[0].id);
  }, [groupId, groupsQuery.data]);

  const group = useMemo(
    () => (groupsQuery.data ?? []).find((g) => g.id === groupId) as MulticamGroupDto | undefined,
    [groupsQuery.data, groupId],
  );

  const timelinesQuery = useQuery({
    queryKey: ['timelines', projectId],
    queryFn: () => timelinesApi.list(projectId) as Promise<Array<{ id: string; name: string }>>,
  });
  const timelineId = group?.timelineId || timelinesQuery.data?.[0]?.id || '';

  const timelineQuery = useQuery({
    queryKey: ['timeline', timelineId],
    queryFn: () => timelinesApi.get(timelineId),
    enabled: !!timelineId,
  });
  const clip = firstVideoClip(timelineQuery.data?.timeline as TimelineDto | undefined);

  const assetsQuery = useQuery({
    queryKey: ['assets', projectId, 'video'],
    queryFn: () => assetsApi.list(projectId, { type: 'video' }),
  });

  const rotoQuery = useQuery({
    queryKey: ['roto-shapes', projectId],
    queryFn: () => multicamApi.listRotoShapes(projectId),
  });
  const mattesQuery = useQuery({
    queryKey: ['mattes', projectId],
    queryFn: () => multicamApi.listMattes(projectId),
  });

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [rotoPoints, setRotoPoints] = useState<Point[]>([
    { x: 0.3, y: 0.3 },
    { x: 0.7, y: 0.3 },
    { x: 0.7, y: 0.7 },
    { x: 0.3, y: 0.7 },
  ]);
  const [frameIn, setFrameIn] = useState(0);
  const [frameOut, setFrameOut] = useState(48);
  const [selectedRoto, setSelectedRoto] = useState<string>('');

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      setCurrentTime((t) => t + 0.1);
    }, 100);
    return () => window.clearInterval(id);
  }, [playing]);

  const createGroupMutation = useMutation({
    mutationFn: () =>
      multicamApi.createGroup(projectId, {
        name: `Multicam ${(groupsQuery.data?.length ?? 0) + 1}`,
        timelineId: timelineId || undefined,
      }),
    onSuccess: (g) => {
      void qc.invalidateQueries({ queryKey: ['multicam-groups', projectId] });
      setGroupId(g.id);
    },
  });

  const addAngleMutation = useMutation({
    mutationFn: (assetId?: string) => {
      if (!groupId) throw new Error('No group');
      const n = group?.angles.length ?? 0;
      return multicamApi.createAngle(groupId, {
        name: `Angle ${String.fromCharCode(65 + n)}`,
        label: String.fromCharCode(65 + n),
        assetId,
      });
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['multicam-groups', projectId] }),
  });

  const switchAngleMutation = useMutation({
    mutationFn: async (angle: MulticamAngleDto) => {
      if (!groupId) throw new Error('No group');
      await multicamApi.setActiveAngle(groupId, angle.id);
      if (timelineId && clip) {
        await timelinesApi.command(timelineId, {
          id: crypto.randomUUID(),
          type: 'set_multicam_angle',
          timestamp: Date.now(),
          source: 'user',
          payload: {
            clipId: clip.id,
            angle: angle.label,
            metadata: { angleId: angle.id, groupId, assetId: angle.assetId },
          },
        });
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['multicam-groups', projectId] });
      void qc.invalidateQueries({ queryKey: ['timeline', timelineId] });
    },
  });

  const saveRotoMutation = useMutation({
    mutationFn: async () => {
      if (selectedRoto) {
        return multicamApi.patchRotoShape(selectedRoto, {
          points: rotoPoints,
          frameIn,
          frameOut,
        });
      }
      return multicamApi.createRotoShape(projectId, {
        name: `Roto ${(rotoQuery.data?.length ?? 0) + 1}`,
        points: rotoPoints,
        frameIn,
        frameOut,
        clipId: clip?.id,
      });
    },
    onSuccess: (row) => {
      void qc.invalidateQueries({ queryKey: ['roto-shapes', projectId] });
      setSelectedRoto(row.id);
      if (timelineId && clip) {
        void timelinesApi.command(timelineId, {
          id: crypto.randomUUID(),
          type: 'add_mask',
          timestamp: Date.now(),
          source: 'user',
          payload: {
            clipId: clip.id,
            mask: {
              shape: 'bezier',
              points: rotoPoints,
              frameIn,
              frameOut,
              rotoShapeId: row.id,
            },
          },
        });
      }
    },
  });

  const matteMutation = useMutation({
    mutationFn: async () => {
      let rotoId = selectedRoto;
      if (!rotoId) {
        const created = await multicamApi.createRotoShape(projectId, {
          name: `Roto ${(rotoQuery.data?.length ?? 0) + 1}`,
          points: rotoPoints,
          frameIn,
          frameOut,
          clipId: clip?.id,
        });
        rotoId = created.id;
        setSelectedRoto(rotoId);
      } else {
        await multicamApi.patchRotoShape(rotoId, { points: rotoPoints, frameIn, frameOut });
      }
      return multicamApi.createMatte(projectId, { rotoShapeId: rotoId });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['mattes', projectId] });
      void qc.invalidateQueries({ queryKey: ['roto-shapes', projectId] });
    },
  });

  const loadRoto = (shape: RotoShapeDto) => {
    setSelectedRoto(shape.id);
    setRotoPoints(shape.points.map((p) => ({ x: p.x, y: p.y })));
    setFrameIn(shape.frameIn);
    setFrameOut(shape.frameOut);
  };

  return (
    <div className="h-full overflow-auto p-4 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-medium text-cinema-text">Multicam + Roto</h1>
          <p className="text-[12px] text-cinema-muted">
            Synced angle grid, angle switch via set_multicam_angle, bezier roto → video.matte.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-md border border-cinema-border px-2.5 py-1.5 text-[12px]"
            onClick={() => createGroupMutation.mutate()}
          >
            New group
          </button>
          <select
            className="rounded-md border border-cinema-border bg-cinema-bg px-2 py-1.5 text-[12px]"
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
          >
            {(groupsQuery.data ?? []).map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="rounded-md bg-cinema-accent/90 px-2.5 py-1.5 text-[12px] text-black font-medium"
            onClick={() => setPlaying((p) => !p)}
          >
            {playing ? 'Pause' : 'Play sync'}
          </button>
          <button
            type="button"
            className="rounded-md border border-cinema-border px-2.5 py-1.5 text-[12px]"
            onClick={() => {
              setPlaying(false);
              setCurrentTime(0);
            }}
          >
            Reset
          </button>
          <span className="text-[11px] font-mono text-cinema-muted">
            t={currentTime.toFixed(1)}s
            {clip ? ` · clip ${clip.label || clip.id.slice(0, 8)}` : ''}
          </span>
          <select
            className="rounded-md border border-cinema-border bg-cinema-bg px-2 py-1 text-[11px]"
            defaultValue=""
            onChange={(e) => {
              const assetId = e.target.value || undefined;
              e.target.value = '';
              addAngleMutation.mutate(assetId);
            }}
          >
            <option value="">+ Add angle…</option>
            {(assetsQuery.data ?? []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
            <option value="">Empty angle</option>
          </select>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {(group?.angles ?? []).map((angle) => (
            <AngleTile
              key={angle.id}
              angle={angle}
              active={group?.activeAngleId === angle.id}
              playing={playing}
              currentTime={currentTime}
              onSelect={() => switchAngleMutation.mutate(angle)}
            />
          ))}
          {!group?.angles?.length && (
            <div className="col-span-full rounded-md border border-dashed border-cinema-border p-6 text-center text-[12px] text-cinema-muted">
              Create a group and add angles from project video assets.
            </div>
          )}
        </div>
        {switchAngleMutation.isSuccess && (
          <div className="text-[11px] text-emerald-400">Active angle written to timeline</div>
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-2">
          <div className="text-[11px] uppercase tracking-wide text-cinema-muted">Roto panel</div>
          <RotoCanvas points={rotoPoints} onChange={setRotoPoints} />
          <div className="flex flex-wrap items-center gap-3 text-[12px]">
            <label className="flex items-center gap-1.5 font-mono">
              In
              <input
                type="number"
                className="w-16 rounded border border-cinema-border bg-cinema-bg px-1.5 py-1"
                value={frameIn}
                onChange={(e) => setFrameIn(Number(e.target.value))}
              />
            </label>
            <label className="flex items-center gap-1.5 font-mono">
              Out
              <input
                type="number"
                className="w-16 rounded border border-cinema-border bg-cinema-bg px-1.5 py-1"
                value={frameOut}
                onChange={(e) => setFrameOut(Number(e.target.value))}
              />
            </label>
            <button
              type="button"
              className="rounded-md border border-cinema-border px-2.5 py-1.5"
              onClick={() => saveRotoMutation.mutate()}
            >
              Save shape
            </button>
            <button
              type="button"
              className="rounded-md bg-cinema-accent/90 px-2.5 py-1.5 text-black font-medium"
              onClick={() => matteMutation.mutate()}
              disabled={matteMutation.isPending}
            >
              Create matte
            </button>
            <button
              type="button"
              className="text-cinema-muted hover:text-cinema-text"
              onClick={() => setRotoPoints([])}
            >
              Clear points
            </button>
          </div>
          {matteMutation.isSuccess && (
            <div className="text-[11px] text-emerald-400">
              Matte job {matteMutation.data.job.id.slice(0, 8)} · status{' '}
              {matteMutation.data.matte.status}
            </div>
          )}
          {matteMutation.isError && (
            <div className="text-[11px] text-rose-400">{(matteMutation.error as Error).message}</div>
          )}
        </div>

        <aside className="space-y-3">
          <div className="rounded-md border border-cinema-border bg-cinema-panel/60 p-3 space-y-2">
            <div className="text-[11px] uppercase tracking-wide text-cinema-muted">Shapes</div>
            <ul className="space-y-1 max-h-40 overflow-auto">
              {(rotoQuery.data ?? []).map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    className={clsx(
                      'w-full text-left rounded px-2 py-1.5 text-[12px]',
                      selectedRoto === s.id ? 'bg-cinema-accent/15' : 'hover:bg-cinema-bg',
                    )}
                    onClick={() => loadRoto(s)}
                  >
                    {s.name}{' '}
                    <span className="font-mono text-[10px] text-cinema-muted">
                      {s.frameIn}–{s.frameOut}
                    </span>
                  </button>
                </li>
              ))}
              {!rotoQuery.data?.length && (
                <li className="text-[11px] text-cinema-muted">No roto shapes yet</li>
              )}
            </ul>
          </div>
          <div className="rounded-md border border-cinema-border bg-cinema-panel/60 p-3 space-y-2">
            <div className="text-[11px] uppercase tracking-wide text-cinema-muted">Mattes</div>
            <ul className="space-y-1 max-h-40 overflow-auto text-[12px]">
              {(mattesQuery.data ?? []).map((m) => (
                <li key={m.id} className="flex justify-between gap-2 font-mono text-[11px]">
                  <span className="truncate">{m.id.slice(0, 8)}</span>
                  <span className="text-cinema-muted">{m.status}</span>
                </li>
              ))}
              {!mattesQuery.data?.length && (
                <li className="text-[11px] text-cinema-muted">No mattes yet</li>
              )}
            </ul>
          </div>
        </aside>
      </section>
    </div>
  );
}

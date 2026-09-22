'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { StatusChip, Spinner, Badge } from '@studio-os/ui';
import {
  generationApi,
  storyApi,
  type SceneDto,
  type ShotDto,
  type TakeDto,
} from '@/lib/api';
import { useStudioStore } from '@/lib/store';
import clsx from 'clsx';
import Link from 'next/link';

type BoardView = 'cards' | 'storyboard' | 'list' | 'status' | 'cost';

function dnaSummary(dna?: Record<string, unknown>): string {
  if (!dna) return 'No DNA';
  const shot = (dna.shot ?? {}) as Record<string, unknown>;
  const camera = (dna.camera ?? {}) as Record<string, unknown>;
  const motion = ((camera.motion ?? {}) as Record<string, unknown>).type;
  const parts = [shot.size, camera.lens, motion].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'Shot DNA';
}

function estimateShotCost(shot: ShotDto): number {
  const meta = shot.shotDna as Record<string, unknown> | undefined;
  const duration = shot.durationSec ?? (typeof meta?.durationSec === 'number' ? meta.durationSec : 5);
  return Math.round(duration * 0.12 * 100) / 100;
}

export function ShotBoard({ projectId }: { projectId: string }) {
  const selectShot = useStudioStore((s) => s.selectShot);
  const selectedId = useStudioStore((s) => s.selection.id);
  const queryClient = useQueryClient();
  const router = useRouter();
  const [view, setView] = useState<BoardView>('cards');
  const [takesShotId, setTakesShotId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['story', projectId],
    queryFn: () => storyApi.get(projectId),
  });

  const reorderMutation = useMutation({
    mutationFn: (orderedIds: string[]) => storyApi.reorderShots(projectId, orderedIds),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['story', projectId] }),
  });

  const generateMutation = useMutation({
    mutationFn: async (shot: ShotDto) => {
      const me = await import('@/lib/api').then((m) => m.authApi.me());
      const ws = me.workspaces?.[0]?.id;
      if (!ws) throw new Error('No workspace');
      return generationApi.generate({
        capability: 'image.generate',
        workspaceId: ws,
        projectId,
        shotId: shot.id,
        intent: {
          prompt: shot.description ?? shot.code,
          shotDna: shot.shotDna,
          parameters: {},
        },
        constraints: { qualityMode: 'draft', takeCount: 1 },
        parentAssetIds: [],
      });
    },
    onSuccess: () => setToast('Generation job queued'),
  });

  const scenes = useMemo(() => {
    return [...(data?.scenes ?? [])].sort(
      (a, b) => (a.sortOrder ?? a.number) - (b.sortOrder ?? b.number),
    );
  }, [data?.scenes]);

  const shots = useMemo(() => {
    return [...(data?.shots ?? [])].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }, [data?.shots]);

  const shotsByScene = useMemo(() => {
    const map = new Map<string, ShotDto[]>();
    for (const shot of shots) {
      const list = map.get(shot.sceneId) ?? [];
      list.push(shot);
      map.set(shot.sceneId, list);
    }
    return map;
  }, [shots]);

  const selectedShot = shots.find((s) => s.id === selectedId) ?? null;

  const onSelect = useCallback(
    (shot: ShotDto) => {
      selectShot(shot.id, shot.code, {
        status: shot.status,
        shotDna: shot.shotDna,
        description: shot.description,
        durationSec: shot.durationSec,
      });
    },
    [selectShot],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);
      if (typing) return;
      const key = e.key.toLowerCase();
      if (key === 'g' && selectedShot) {
        e.preventDefault();
        generateMutation.mutate(selectedShot);
      } else if (key === 'r' && selectedShot) {
        e.preventDefault();
        generateMutation.mutate(selectedShot);
        setToast('Regenerate queued');
      } else if (key === 't' && selectedShot) {
        e.preventDefault();
        setTakesShotId(selectedShot.id);
      } else if (key === 'c') {
        e.preventDefault();
        router.push(`/projects/${projectId}/continuity`);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedShot, generateMutation, router, projectId]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(t);
  }, [toast]);

  const onDropReorder = (targetId: string) => {
    if (!dragId || dragId === targetId) {
      setDragId(null);
      return;
    }
    const ids = shots.map((s) => s.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) {
      setDragId(null);
      return;
    }
    const next = [...ids];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved!);
    setDragId(null);
    reorderMutation.mutate(next);
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Spinner label="Loading story…" size={18} />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="max-w-md text-center">
          <div className="text-[14px] font-semibold mb-2">Couldn’t load Director’s Board</div>
          <p className="text-[12px] text-cinema-muted">
            {error instanceof Error ? error.message : 'Story API unavailable. Start the API on :4000.'}
          </p>
        </div>
      </div>
    );
  }

  const views: { id: BoardView; label: string }[] = [
    { id: 'cards', label: 'Cards' },
    { id: 'storyboard', label: 'Storyboard' },
    { id: 'list', label: 'Shot list' },
    { id: 'status', label: 'Status' },
    { id: 'cost', label: 'Cost' },
  ];

  return (
    <div className="h-full overflow-y-auto relative">
      <div className="sticky top-0 z-10 border-b border-cinema-border bg-cinema-bg/95 backdrop-blur px-4 py-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.14em] text-cinema-muted font-semibold">
            Director’s Board
          </div>
          <h1 className="text-[18px] font-semibold mt-0.5">
            {data.script?.title ?? 'Shot board'}
            <span className="text-cinema-muted font-normal text-[13px] ml-2">
              {shots.length} shots · {scenes.length} scenes
            </span>
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-md border border-cinema-border overflow-hidden">
            {views.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setView(v.id)}
                className={clsx(
                  'px-2.5 py-1 text-[11px] font-medium',
                  view === v.id
                    ? 'bg-cinema-accent/15 text-cinema-accent'
                    : 'text-cinema-muted hover:bg-cinema-raised',
                )}
              >
                {v.label}
              </button>
            ))}
          </div>
          <Badge tone="neutral">G gen · R regen · T takes · C continuity</Badge>
        </div>
      </div>

      <div className="p-4 space-y-5 studio-grid-bg min-h-full">
        {view === 'cards' &&
          scenes.map((scene) => (
            <SceneStrip
              key={scene.id}
              scene={scene}
              shots={shotsByScene.get(scene.id) ?? []}
              selectedId={selectedId}
              dragId={dragId}
              onSelect={onSelect}
              onOpenTakes={(id) => setTakesShotId(id)}
              onDragStart={setDragId}
              onDrop={onDropReorder}
            />
          ))}

        {view === 'storyboard' && (
          <div className="flex gap-3 overflow-x-auto pb-4">
            {shots.map((shot) => (
              <button
                key={shot.id}
                type="button"
                draggable
                onDragStart={() => setDragId(shot.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDropReorder(shot.id)}
                onClick={() => onSelect(shot)}
                className={clsx(
                  'shrink-0 w-[200px] rounded-md border overflow-hidden text-left',
                  selectedId === shot.id
                    ? 'border-cinema-accent'
                    : 'border-cinema-border bg-cinema-panel',
                )}
              >
                <div className="aspect-video studio-grid-bg flex items-center justify-center font-mono text-[16px]">
                  {shot.code}
                </div>
                <div className="p-2 text-[11px] line-clamp-2">{shot.description || '—'}</div>
              </button>
            ))}
          </div>
        )}

        {(view === 'list' || view === 'status' || view === 'cost') && (
          <div className="rounded-lg border border-cinema-border overflow-hidden">
            <table className="w-full text-left text-[12px]">
              <thead className="bg-cinema-raised/50 text-cinema-muted uppercase tracking-wide text-[10px]">
                <tr>
                  <th className="px-3 py-2">Code</th>
                  <th className="px-3 py-2">Description</th>
                  {view !== 'cost' && <th className="px-3 py-2">Status</th>}
                  <th className="px-3 py-2">Dur</th>
                  {(view === 'cost' || view === 'list') && <th className="px-3 py-2">Est. $</th>}
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {shots.map((shot) => (
                  <tr
                    key={shot.id}
                    draggable
                    onDragStart={() => setDragId(shot.id)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => onDropReorder(shot.id)}
                    onClick={() => onSelect(shot)}
                    className={clsx(
                      'border-t border-cinema-border cursor-pointer',
                      selectedId === shot.id ? 'bg-cinema-accent/10' : 'hover:bg-cinema-raised/40',
                    )}
                  >
                    <td className="px-3 py-2 font-mono text-cinema-accent">{shot.code}</td>
                    <td className="px-3 py-2 max-w-[280px] truncate">{shot.description || '—'}</td>
                    {view !== 'cost' && (
                      <td className="px-3 py-2">
                        <StatusChip status={shot.status ?? 'draft'} />
                      </td>
                    )}
                    <td className="px-3 py-2 font-mono">{shot.durationSec ?? '—'}s</td>
                    {(view === 'cost' || view === 'list') && (
                      <td className="px-3 py-2 font-mono">${estimateShotCost(shot).toFixed(2)}</td>
                    )}
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        className="text-cinema-muted hover:text-cinema-accent text-[11px]"
                        onClick={(e) => {
                          e.stopPropagation();
                          setTakesShotId(shot.id);
                        }}
                      >
                        Takes
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {view === 'cost' && (
              <div className="border-t border-cinema-border px-3 py-2 text-[12px] text-cinema-muted flex justify-between">
                <span>Board estimate (heuristic)</span>
                <span className="font-mono text-cinema-text">
                  ${shots.reduce((s, sh) => s + estimateShotCost(sh), 0).toFixed(2)}
                </span>
              </div>
            )}
          </div>
        )}

        {view === 'status' && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {['draft', 'ready', 'review', 'approved', 'generating', 'locked'].map((status) => {
              const count = shots.filter((s) => (s.status ?? 'draft') === status).length;
              return (
                <div
                  key={status}
                  className="rounded-md border border-cinema-border bg-cinema-panel px-3 py-2"
                >
                  <div className="text-[10px] uppercase tracking-wide text-cinema-muted">{status}</div>
                  <div className="text-[20px] font-semibold font-mono mt-1">{count}</div>
                </div>
              );
            })}
          </div>
        )}

        {scenes.length === 0 && shots.length === 0 && (
          <div className="rounded-lg border border-dashed border-cinema-border p-10 text-center text-cinema-muted text-[13px]">
            No scenes yet. Extract a story bible or add shots manually.
          </div>
        )}
      </div>

      {takesShotId && (
        <TakesDrawer
          shotId={takesShotId}
          projectId={projectId}
          onClose={() => setTakesShotId(null)}
        />
      )}

      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 rounded-md border border-cinema-border bg-cinema-panel px-3 py-2 text-[12px] shadow-cinema">
          {toast}
        </div>
      )}
    </div>
  );
}

function SceneStrip({
  scene,
  shots,
  selectedId,
  dragId,
  onSelect,
  onOpenTakes,
  onDragStart,
  onDrop,
}: {
  scene: SceneDto;
  shots: ShotDto[];
  selectedId: string | null;
  dragId: string | null;
  onSelect: (shot: ShotDto) => void;
  onOpenTakes: (id: string) => void;
  onDragStart: (id: string) => void;
  onDrop: (id: string) => void;
}) {
  return (
    <section className="rounded-lg border border-cinema-border bg-cinema-panel/90 overflow-hidden shadow-cinema">
      <header className="px-3 py-2.5 border-b border-cinema-border flex items-start justify-between gap-3 bg-cinema-raised/40">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[12px] text-cinema-accent font-semibold">
              {scene.slug || scene.number}
            </span>
            <h2 className="text-[13px] font-semibold truncate">{scene.heading}</h2>
            {scene.status && <StatusChip status={scene.status} />}
          </div>
          {scene.synopsis && (
            <p className="text-[12px] text-cinema-muted mt-1 line-clamp-2">{scene.synopsis}</p>
          )}
        </div>
        <div className="text-right shrink-0 text-[11px] text-cinema-muted font-mono">
          {scene.durationTargetSec ? `${scene.durationTargetSec}s` : '—'}
          <div>{shots.length} shots</div>
        </div>
      </header>

      <div className="p-3 grid grid-cols-2 md:grid-cols-4 gap-2.5">
        {shots.map((shot) => {
          const active = selectedId === shot.id;
          return (
            <div
              key={shot.id}
              draggable
              onDragStart={() => onDragStart(shot.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDrop(shot.id)}
              className={clsx(
                'text-left rounded-md border overflow-hidden transition-colors',
                active
                  ? 'border-cinema-accent bg-cinema-accent/10'
                  : 'border-cinema-border bg-cinema-bg hover:border-cinema-border-strong',
                dragId === shot.id && 'opacity-60',
              )}
            >
              <button type="button" className="w-full text-left" onClick={() => onSelect(shot)}>
                <div className="aspect-video bg-gradient-to-br from-[#141820] to-[#0b0d10] relative studio-grid-bg">
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="font-mono text-[18px] font-semibold text-cinema-text/90">
                      {shot.code}
                    </span>
                  </div>
                  <div className="absolute top-1.5 left-1.5">
                    <StatusChip status={shot.status ?? 'draft'} />
                  </div>
                  <div className="absolute bottom-1.5 right-1.5 text-[10px] font-mono text-cinema-muted bg-black/40 px-1 rounded">
                    {shot.durationSec ?? '—'}s
                  </div>
                </div>
                <div className="p-2">
                  <div className="text-[12px] font-medium line-clamp-2 min-h-[32px]">
                    {shot.description || shot.code}
                  </div>
                  <div className="text-[10.5px] text-cinema-muted mt-1 truncate">
                    {dnaSummary(shot.shotDna)}
                  </div>
                </div>
              </button>
              <div className="px-2 pb-2 flex justify-end">
                <button
                  type="button"
                  className="text-[10px] text-cinema-muted hover:text-cinema-accent"
                  onClick={() => onOpenTakes(shot.id)}
                >
                  Takes →
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function TakesDrawer({
  shotId,
  projectId,
  onClose,
}: {
  shotId: string;
  projectId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['takes', shotId],
    queryFn: () => storyApi.listTakes(shotId),
  });

  const patchMutation = useMutation({
    mutationFn: ({
      takeId,
      body,
    }: {
      takeId: string;
      body: Partial<Pick<TakeDto, 'rating' | 'selected' | 'status'>>;
    }) => storyApi.patchTake(takeId, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['takes', shotId] }),
  });

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <aside
        className="w-full max-w-md h-full bg-cinema-panel border-l border-cinema-border shadow-cinema flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-4 py-3 border-b border-cinema-border flex items-center justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-cinema-muted">Takes</div>
            <div className="text-[14px] font-semibold font-mono">{data?.shot.code ?? '…'}</div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/projects/${projectId}/compare?shotId=${shotId}`}
              className="text-[11px] text-cinema-accent hover:underline"
            >
              Compare
            </Link>
            <button type="button" className="text-[12px] text-cinema-muted" onClick={onClose}>
              Close
            </button>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {isLoading && <Spinner label="Loading takes…" size={16} />}
          {!isLoading && (data?.takes?.length ?? 0) === 0 && (
            <p className="text-[12px] text-cinema-muted p-4 text-center">
              No takes yet. Press G to generate.
            </p>
          )}
          {data?.takes?.map((take) => (
            <div
              key={take.id}
              className={clsx(
                'rounded-md border p-3',
                take.selected
                  ? 'border-cinema-accent bg-cinema-accent/10'
                  : 'border-cinema-border bg-cinema-bg',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="font-mono text-[13px]">Take {take.number}</div>
                <StatusChip status={take.status ?? 'draft'} />
              </div>
              <div className="mt-1 text-[11px] text-cinema-muted font-mono">
                {take.modelId ?? 'model?'} · seed {take.seed ?? '—'} · $
                {(take.costUsd ?? 0).toFixed(2)}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={clsx(
                      'h-6 w-6 rounded text-[11px] border',
                      (take.rating ?? 0) >= n
                        ? 'border-cinema-accent text-cinema-accent'
                        : 'border-cinema-border text-cinema-muted',
                    )}
                    onClick={() => patchMutation.mutate({ takeId: take.id, body: { rating: n } })}
                  >
                    {n}
                  </button>
                ))}
                <button
                  type="button"
                  className="ml-auto px-2 py-1 text-[11px] rounded border border-cinema-border hover:border-cinema-accent"
                  onClick={() =>
                    patchMutation.mutate({ takeId: take.id, body: { selected: true } })
                  }
                >
                  Select
                </button>
                <button
                  type="button"
                  className="px-2 py-1 text-[11px] rounded border border-cinema-border hover:border-cinema-accent"
                  onClick={() =>
                    patchMutation.mutate({
                      takeId: take.id,
                      body: { status: 'approved', selected: true },
                    })
                  }
                >
                  Approve
                </button>
              </div>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}

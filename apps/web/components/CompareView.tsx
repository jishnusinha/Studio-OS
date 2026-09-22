'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Spinner, StatusChip } from '@studio-os/ui';
import { assetsApi, storyApi, type TakeDto } from '@/lib/api';
import { useStudioStore } from '@/lib/store';
import clsx from 'clsx';

type Layout = 2 | 3 | 4;

export function CompareView({
  shotId: shotIdProp,
}: {
  shotId?: string | null;
} = {}) {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const projectId = params.id;
  const selection = useStudioStore((s) => s.selection);
  const shotId =
    shotIdProp ?? search.get('shotId') ?? (selection.kind === 'shot' ? selection.id : null);

  const [layout, setLayout] = useState<Layout>(2);
  const [sync, setSync] = useState(true);
  const [t, setT] = useState(0);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);

  const storyQuery = useQuery({
    queryKey: ['story', projectId],
    queryFn: () => storyApi.get(projectId),
  });

  const effectiveShotId =
    shotId ?? storyQuery.data?.shots?.[0]?.id ?? null;

  const takesQuery = useQuery({
    queryKey: ['takes', effectiveShotId],
    queryFn: () => storyApi.listTakes(effectiveShotId!),
    enabled: Boolean(effectiveShotId),
  });

  const queryClient = useQueryClient();
  const selectMutation = useMutation({
    mutationFn: (takeId: string) => storyApi.patchTake(takeId, { selected: true }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['takes', effectiveShotId] }),
  });

  const takes = takesQuery.data?.takes ?? [];
  const visible = takes.slice(0, layout);
  const shotCode = takesQuery.data?.shot.code ?? selection.label ?? 'Shot';

  useEffect(() => {
    if (!sync) return;
    for (const v of videoRefs.current) {
      if (v && Math.abs(v.currentTime - t) > 0.12) {
        try {
          v.currentTime = t;
        } catch {
          /* ignore seek errors */
        }
      }
    }
  }, [t, sync]);

  const cols = layout === 2 ? 'grid-cols-2' : layout === 3 ? 'grid-cols-3' : 'grid-cols-2 md:grid-cols-4';

  if (!effectiveShotId) {
    return (
      <div className="h-full flex items-center justify-center text-[13px] text-cinema-muted">
        Select a shot on the board, then open Compare.
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="border-b border-cinema-border px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.14em] text-cinema-muted font-semibold">
            Compare
          </div>
          <h1 className="text-[16px] font-semibold">
            {shotCode} · {layout}-up synced
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <StatusChip status="review" />
          {([2, 3, 4] as Layout[]).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setLayout(n)}
              className={clsx(
                'px-2 py-0.5 text-[11px] rounded border',
                layout === n
                  ? 'border-cinema-accent text-cinema-accent'
                  : 'border-cinema-border text-cinema-muted',
              )}
            >
              {n}-up
            </button>
          ))}
          <label className="flex items-center gap-2 text-[12px] text-cinema-muted">
            <input
              type="checkbox"
              checked={sync}
              onChange={(e) => setSync(e.target.checked)}
              className="accent-cinema-accent"
            />
            Sync scrub
          </label>
        </div>
      </div>

      {takesQuery.isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <Spinner label="Loading takes…" size={18} />
        </div>
      ) : visible.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-[13px] text-cinema-muted">
          No takes for this shot yet.
        </div>
      ) : (
        <div className={clsx('flex-1 min-h-0 grid gap-px bg-cinema-border', cols)}>
          {visible.map((take, i) => (
            <TakePane
              key={take.id}
              take={take}
              index={i}
              sync={sync}
              t={t}
              videoRefs={videoRefs}
              onChoose={() => selectMutation.mutate(take.id)}
              choosing={selectMutation.isPending}
            />
          ))}
        </div>
      )}

      <div className="border-t border-cinema-border px-4 py-3 bg-cinema-panel">
        <input
          type="range"
          min={0}
          max={30}
          step={0.04}
          value={t}
          onChange={(e) => setT(Number(e.target.value))}
          className="w-full accent-cinema-accent"
          disabled={!sync}
        />
        <div className="mt-1 flex justify-between text-[10px] font-mono text-cinema-muted">
          <span>00:00:00:00</span>
          <span>{sync ? 'Synced playhead' : 'Independent'}</span>
          <span>{t.toFixed(2)}s</span>
        </div>
      </div>
    </div>
  );
}

function TakePane({
  take,
  index,
  sync,
  t,
  videoRefs,
  onChoose,
  choosing,
}: {
  take: TakeDto;
  index: number;
  sync: boolean;
  t: number;
  videoRefs: React.MutableRefObject<(HTMLVideoElement | null)[]>;
  onChoose: () => void;
  choosing: boolean;
}) {
  const { data: urlData } = useQuery({
    queryKey: ['asset-url', take.assetId],
    queryFn: () => assetsApi.signedUrl(take.assetId!, 'proxy'),
    enabled: Boolean(take.assetId),
  });

  return (
    <div className="bg-cinema-bg flex flex-col min-h-0">
      <div className="px-3 py-2 border-b border-cinema-border flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[13px] font-semibold">Take {take.number}</div>
          <div className="text-[11px] text-cinema-muted truncate">
            {take.promptCompiled?.slice(0, 80) ?? take.modelId ?? '—'}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {take.seed != null && <Badge tone="neutral">seed {take.seed}</Badge>}
          {take.selected && <Badge tone="accent">selected</Badge>}
          <button
            type="button"
            disabled={choosing}
            onClick={onChoose}
            className="text-[11px] px-2 py-1 rounded border border-cinema-border hover:border-cinema-accent"
          >
            Choose
          </button>
        </div>
      </div>
      <div className="flex-1 relative studio-grid-bg min-h-[180px] bg-black">
        {urlData?.url ? (
          <video
            ref={(el) => {
              videoRefs.current[index] = el;
            }}
            src={urlData.url}
            className="absolute inset-0 w-full h-full object-contain"
            playsInline
            muted
            onTimeUpdate={(e) => {
              if (!sync) return;
              // driven by shared scrub; ignore individual drift
              void e;
              void t;
            }}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-[12px] text-cinema-muted">
            {take.assetId ? 'Loading proxy…' : 'No asset'}
          </div>
        )}
      </div>
    </div>
  );
}

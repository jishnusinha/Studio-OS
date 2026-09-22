'use client';

import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Spinner } from '@studio-os/ui';
import {
  continuityApi,
  storyApi,
  type ContinuityCheckDetailDto,
  type ContinuityScoreDto,
} from '@/lib/api';
import clsx from 'clsx';

function scoreTone(score: number): 'accent' | 'warning' | 'danger' | 'neutral' {
  if (score >= 0.9) return 'accent';
  if (score >= 0.75) return 'warning';
  return 'danger';
}

function heatColor(score: number): string {
  if (score >= 0.9) return 'bg-emerald-500/25 border-emerald-500/40 text-emerald-200';
  if (score >= 0.75) return 'bg-amber-500/20 border-amber-500/35 text-amber-100';
  return 'bg-rose-500/25 border-rose-500/40 text-rose-100';
}

function explanation(score: ContinuityScoreDto): string {
  const details = score.details ?? {};
  if (typeof details.explanation === 'string') return details.explanation;
  return `${score.dimension} score ${score.score.toFixed(2)}`;
}

export default function ContinuityPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const queryClient = useQueryClient();
  const [selectedCheckId, setSelectedCheckId] = useState<string | null>(null);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [selectedScoreId, setSelectedScoreId] = useState<string | null>(null);

  const checksQuery = useQuery({
    queryKey: ['continuity-checks', projectId],
    queryFn: () => continuityApi.listChecks(projectId),
  });

  const storyQuery = useQuery({
    queryKey: ['story', projectId],
    queryFn: () => storyApi.get(projectId),
  });

  useEffect(() => {
    if (!selectedCheckId && checksQuery.data?.[0]) {
      setSelectedCheckId(checksQuery.data[0].id);
    }
  }, [selectedCheckId, checksQuery.data]);

  const detailQuery = useQuery({
    queryKey: ['continuity-check', selectedCheckId],
    queryFn: () => continuityApi.getCheck(selectedCheckId!),
    enabled: Boolean(selectedCheckId),
  });

  const runMutation = useMutation({
    mutationFn: () => continuityApi.run(projectId, { scopeType: 'project' }),
    onSuccess: (detail) => {
      setSelectedCheckId(detail.id);
      queryClient.invalidateQueries({ queryKey: ['continuity-checks', projectId] });
      queryClient.setQueryData(['continuity-check', detail.id], detail);
    },
  });

  const repairOneMutation = useMutation({
    mutationFn: (scoreId: string) => continuityApi.repairScore(scoreId),
    onSuccess: () => {
      if (selectedCheckId) {
        queryClient.invalidateQueries({ queryKey: ['continuity-check', selectedCheckId] });
      }
    },
  });

  const repairBatchMutation = useMutation({
    mutationFn: () => continuityApi.repairBatch(selectedCheckId!),
    onSuccess: () => {
      if (selectedCheckId) {
        queryClient.invalidateQueries({ queryKey: ['continuity-check', selectedCheckId] });
      }
    },
  });

  const detail = detailQuery.data as ContinuityCheckDetailDto | undefined;
  const shotCode = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of storyQuery.data?.shots ?? []) {
      map.set(s.id, s.code);
    }
    return map;
  }, [storyQuery.data?.shots]);

  const sceneViolations = useMemo(() => {
    if (!detail) return [];
    if (!selectedSceneId) return detail.violations;
    const sceneShotIds = new Set(
      (storyQuery.data?.shots ?? [])
        .filter((s) => s.sceneId === selectedSceneId)
        .map((s) => s.id),
    );
    return detail.violations.filter((v) => sceneShotIds.has(v.shotId));
  }, [detail, selectedSceneId, storyQuery.data?.shots]);

  const selectedScore = detail?.scores.find((s) => s.id === selectedScoreId) ?? null;

  return (
    <div className="h-full overflow-y-auto">
      <div className="border-b border-cinema-border px-4 py-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.14em] text-cinema-muted font-semibold">
            Continuity Engine
          </div>
          <h1 className="text-[16px] font-semibold">Scene heatmap · Violations · Repair</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={!selectedCheckId || repairBatchMutation.isPending || !detail?.violations.length}
            onClick={() => repairBatchMutation.mutate()}
          >
            {repairBatchMutation.isPending ? 'Repairing…' : 'Batch repair'}
          </Button>
          <Button size="sm" disabled={runMutation.isPending} onClick={() => runMutation.mutate()}>
            {runMutation.isPending ? 'Running…' : 'Run check'}
          </Button>
        </div>
      </div>

      <div className="p-4 max-w-[1200px] space-y-4">
        <div className="flex flex-wrap gap-2">
          {(checksQuery.data ?? []).slice(0, 8).map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setSelectedCheckId(c.id)}
              className={clsx(
                'rounded-md border px-2.5 py-1.5 text-[11px] text-left',
                selectedCheckId === c.id
                  ? 'border-cinema-accent/50 bg-cinema-accent/10 text-cinema-accent'
                  : 'border-cinema-border text-cinema-muted hover:text-cinema-text',
              )}
            >
              <span className="font-mono">{c.status}</span>
              <span className="ml-2 opacity-70">
                {new Date(c.createdAt).toLocaleString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </button>
          ))}
          {checksQuery.isLoading && <Spinner label="Loading checks…" size={14} />}
          {!checksQuery.isLoading && (checksQuery.data?.length ?? 0) === 0 && (
            <p className="text-[12px] text-cinema-muted">No checks yet — run one to score the project.</p>
          )}
        </div>

        {detailQuery.isLoading && selectedCheckId && (
          <div className="py-10 flex justify-center">
            <Spinner label="Loading continuity detail…" size={18} />
          </div>
        )}

        {detail && (
          <>
            <section>
              <div className="mb-2 flex items-center justify-between gap-2">
                <h2 className="text-[13px] font-semibold">Scene heatmap</h2>
                <Badge tone="neutral">
                  {detail.violations.length} violation
                  {detail.violations.length === 1 ? '' : 's'}
                </Badge>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                {detail.heatmap.map((cell) => (
                  <button
                    key={cell.sceneId}
                    type="button"
                    onClick={() =>
                      setSelectedSceneId((cur) => (cur === cell.sceneId ? null : cell.sceneId))
                    }
                    className={clsx(
                      'rounded-md border p-2.5 text-left transition-colors',
                      heatColor(cell.minScore),
                      selectedSceneId === cell.sceneId && 'ring-1 ring-cinema-accent',
                    )}
                  >
                    <div className="text-[10px] uppercase tracking-wide opacity-80">
                      {cell.slug || `Sc ${cell.number}`}
                    </div>
                    <div className="text-[12px] font-medium line-clamp-2 mt-0.5">{cell.heading}</div>
                    <div className="mt-2 flex items-center justify-between text-[11px] font-mono">
                      <span>{cell.minScore.toFixed(2)}</span>
                      <span className="opacity-70">{cell.violations}↓</span>
                    </div>
                  </button>
                ))}
                {detail.heatmap.length === 0 && (
                  <p className="text-[12px] text-cinema-muted col-span-full">
                    No scene scores in this check.
                  </p>
                )}
              </div>
            </section>

            <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-4">
              <section className="rounded-lg border border-cinema-border bg-cinema-panel/40">
                <div className="px-3 py-2 border-b border-cinema-border flex items-center justify-between">
                  <h2 className="text-[13px] font-semibold">Violations</h2>
                  {selectedSceneId && (
                    <button
                      type="button"
                      className="text-[11px] text-cinema-muted hover:text-cinema-text"
                      onClick={() => setSelectedSceneId(null)}
                    >
                      Clear scene filter
                    </button>
                  )}
                </div>
                <ul className="divide-y divide-cinema-border max-h-[420px] overflow-y-auto">
                  {sceneViolations.map((v) => (
                    <li key={v.id}>
                      <button
                        type="button"
                        className={clsx(
                          'w-full text-left px-3 py-2.5 hover:bg-cinema-raised',
                          selectedScoreId === v.id && 'bg-cinema-raised',
                        )}
                        onClick={() => setSelectedScoreId(v.id)}
                      >
                        <div className="flex items-center gap-2">
                          <Badge tone={scoreTone(v.score)}>{v.score.toFixed(2)}</Badge>
                          <span className="text-[12px] font-medium capitalize">{v.dimension}</span>
                          <span className="text-[11px] font-mono text-cinema-muted">
                            {shotCode.get(v.shotId) ?? v.shotId.slice(0, 8)}
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] text-cinema-muted line-clamp-2">
                          {explanation(v)}
                        </p>
                      </button>
                    </li>
                  ))}
                  {sceneViolations.length === 0 && (
                    <li className="px-3 py-8 text-center text-[12px] text-cinema-muted">
                      No violations in this view.
                    </li>
                  )}
                </ul>
              </section>

              <section className="rounded-lg border border-cinema-border bg-cinema-panel/40 p-3">
                <h2 className="text-[13px] font-semibold mb-2">Drill-down</h2>
                {!selectedScore && (
                  <p className="text-[12px] text-cinema-muted">
                    Select a violation to inspect citations and queue a repair.
                  </p>
                )}
                {selectedScore && (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={scoreTone(selectedScore.score)}>
                        {selectedScore.score.toFixed(2)}
                      </Badge>
                      <span className="text-[13px] font-medium capitalize">
                        {selectedScore.dimension}
                      </span>
                      <span className="text-[11px] font-mono text-cinema-muted">
                        {shotCode.get(selectedScore.shotId) ?? selectedScore.shotId}
                      </span>
                    </div>
                    <p className="text-[12px] leading-relaxed">{explanation(selectedScore)}</p>
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-cinema-muted mb-1">
                        Citations
                      </div>
                      <ul className="space-y-1.5">
                        {(selectedScore.citations ?? []).map((c, i) => {
                          const row = (c ?? {}) as Record<string, unknown>;
                          return (
                            <li
                              key={i}
                              className="rounded border border-cinema-border bg-cinema-bg/50 px-2 py-1.5 text-[11px]"
                            >
                              <span className="font-mono text-cinema-accent">
                                {String(row.type ?? 'ref')}
                              </span>
                              {row.key != null && (
                                <span className="ml-2 text-cinema-muted">{String(row.key)}</span>
                              )}
                              {row.value != null && (
                                <div className="mt-0.5 text-cinema-text">{String(row.value)}</div>
                              )}
                              {row.note != null && (
                                <div className="mt-0.5 text-cinema-muted">{String(row.note)}</div>
                              )}
                            </li>
                          );
                        })}
                        {(selectedScore.citations?.length ?? 0) === 0 && (
                          <li className="text-[11px] text-cinema-muted">No citations</li>
                        )}
                      </ul>
                    </div>
                    <Button
                      size="sm"
                      disabled={repairOneMutation.isPending}
                      onClick={() => repairOneMutation.mutate(selectedScore.id)}
                    >
                      {repairOneMutation.isPending ? 'Queuing…' : 'Repair shot'}
                    </Button>
                    {repairOneMutation.isSuccess && (
                      <p className="text-[11px] text-emerald-300">Repair job queued.</p>
                    )}
                    {repairOneMutation.isError && (
                      <p className="text-[11px] text-rose-300">
                        {(repairOneMutation.error as Error).message}
                      </p>
                    )}
                  </div>
                )}
              </section>
            </div>
          </>
        )}

        {(runMutation.isError || repairBatchMutation.isError) && (
          <p className="text-[12px] text-rose-300">
            {(runMutation.error as Error | null)?.message ||
              (repairBatchMutation.error as Error | null)?.message}
          </p>
        )}
      </div>
    </div>
  );
}

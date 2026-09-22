'use client';

import { useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Badge, Spinner } from '@studio-os/ui';
import { assetsApi, type LineageNodeDto } from '@/lib/api';
import { useStudioStore } from '@/lib/store';
import clsx from 'clsx';

const kindColor: Record<string, string> = {
  asset: '#fbbf24',
  take: '#7dd3fc',
  shot: '#6ee7b7',
  prompt: '#8b929a',
};

export function LineageGraph({
  assetId: assetIdProp,
}: {
  assetId?: string | null;
} = {}) {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const selection = useStudioStore((s) => s.selection);
  const [selectedNode, setSelectedNode] = useState<LineageNodeDto | null>(null);

  const assetId =
    assetIdProp ??
    search.get('assetId') ??
    (selection.meta?.assetId as string | undefined) ??
    (selection.kind === 'asset' ? selection.id : null);

  const assetsQuery = useQuery({
    queryKey: ['assets', params.id],
    queryFn: () => assetsApi.list(params.id),
    enabled: !assetId && Boolean(params.id),
  });

  const fallbackAssetId = useMemo(() => {
    const list = (assetsQuery.data ?? []) as Array<{ id: string }>;
    return list[0]?.id ?? null;
  }, [assetsQuery.data]);

  const effectiveId = assetId ?? fallbackAssetId;

  const lineageQuery = useQuery({
    queryKey: ['lineage', effectiveId],
    queryFn: () => assetsApi.lineage(effectiveId!),
    enabled: Boolean(effectiveId),
  });

  const staleMutation = useMutation({
    mutationFn: () => assetsApi.updateStale(effectiveId!),
  });

  const nodes = lineageQuery.data?.nodes ?? [];
  const edges = lineageQuery.data?.edges ?? [];

  // Simple layered layout
  const laidOut = useMemo(() => {
    const ancestors = new Set(lineageQuery.data?.ancestors ?? []);
    const descendants = new Set(lineageQuery.data?.descendants ?? []);
    return nodes.map((n, i) => {
      let col = 1;
      if (ancestors.has(n.id)) col = 0;
      else if (n.id === effectiveId) col = 1;
      else if (descendants.has(n.id)) col = 2;
      const peers = nodes.filter((x) => {
        let c = 1;
        if (ancestors.has(x.id)) c = 0;
        else if (x.id === effectiveId) c = 1;
        else if (descendants.has(x.id)) c = 2;
        return c === col;
      });
      const row = peers.findIndex((p) => p.id === n.id);
      return {
        ...n,
        x: 40 + col * 220,
        y: 40 + Math.max(0, row) * 70,
        _i: i,
      };
    });
  }, [nodes, lineageQuery.data, effectiveId]);

  const nodeMap = Object.fromEntries(laidOut.map((n) => [n.id, n]));

  if (!effectiveId) {
    return (
      <div className="h-full flex items-center justify-center text-[13px] text-cinema-muted p-6 text-center">
        Select an asset (or open a clip with an assetId) to inspect lineage.
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="border-b border-cinema-border px-4 py-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[11px] uppercase tracking-[0.14em] text-cinema-muted font-semibold">
            Lineage
          </div>
          <h1 className="text-[16px] font-semibold font-mono truncate max-w-[420px]">
            {effectiveId.slice(0, 8)}…
          </h1>
        </div>
        <div className="flex gap-1.5 items-center">
          <Badge tone="warning">asset</Badge>
          <button
            type="button"
            className="text-[11px] px-2 py-1 rounded border border-cinema-border hover:border-cinema-accent"
            disabled={!effectiveId || staleMutation.isPending}
            onClick={() => staleMutation.mutate()}
          >
            Update stale dependents
          </button>
        </div>
      </div>

      {lineageQuery.isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <Spinner label="Loading lineage…" size={18} />
        </div>
      ) : lineageQuery.error ? (
        <div className="flex-1 flex items-center justify-center text-[13px] text-cinema-muted p-6">
          {lineageQuery.error instanceof Error
            ? lineageQuery.error.message
            : 'Failed to load lineage'}
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex">
          <div className="flex-1 overflow-auto p-4 studio-grid-bg">
            <svg
              viewBox={`0 0 ${Math.max(640, laidOut.length * 80)} ${Math.max(280, laidOut.length * 40)}`}
              className="w-full min-w-[640px] h-auto rounded-lg border border-cinema-border bg-cinema-panel/80"
            >
              {edges.map((e) => {
                const a = nodeMap[e.from];
                const b = nodeMap[e.to];
                if (!a || !b) return null;
                return (
                  <line
                    key={`${e.from}-${e.to}`}
                    x1={a.x + 70}
                    y1={a.y + 18}
                    x2={b.x}
                    y2={b.y + 18}
                    stroke={e.stale ? '#f59e0b' : '#2a3140'}
                    strokeWidth={1.5}
                    strokeDasharray={e.stale ? '4 3' : undefined}
                  />
                );
              })}
              {laidOut.map((n) => (
                <g
                  key={n.id}
                  className="cursor-pointer"
                  onClick={() => setSelectedNode(n)}
                >
                  <rect
                    x={n.x}
                    y={n.y}
                    width={140}
                    height={36}
                    rx={6}
                    fill={selectedNode?.id === n.id ? '#1a2430' : '#12151a'}
                    stroke={kindColor[n.kind] ?? '#8b929a'}
                    strokeWidth={n.stale ? 2 : 1.25}
                  />
                  <text
                    x={n.x + 10}
                    y={n.y + 22}
                    fill="#e8eaed"
                    fontSize={11}
                    fontFamily="ui-monospace, monospace"
                  >
                    {(n.label ?? n.id).slice(0, 18)}
                  </text>
                </g>
              ))}
            </svg>

            <div className="mt-4 grid md:grid-cols-3 gap-3">
              <InfoCard
                title="Ancestors"
                body={`${lineageQuery.data?.ancestors.length ?? 0} upstream assets`}
              />
              <InfoCard
                title="Descendants"
                body={`${lineageQuery.data?.descendants.length ?? 0} downstream · ${lineageQuery.data?.staleDependents.length ?? 0} stale`}
              />
              <InfoCard
                title="Invalidation"
                body={
                  staleMutation.data
                    ? String((staleMutation.data as { message?: string }).message ?? 'Plan ready')
                    : 'Click “Update stale dependents” to mark downstream edges stale'
                }
              />
            </div>
          </div>

          <aside className="w-[280px] shrink-0 border-l border-cinema-border p-3 overflow-y-auto">
            <div className="text-[11px] uppercase tracking-wide text-cinema-muted font-semibold mb-2">
              Inspect
            </div>
            {selectedNode ? (
              <div className="space-y-2 text-[12px]">
                <div className="font-semibold truncate">{selectedNode.label}</div>
                <div className="font-mono text-[10px] text-cinema-muted break-all">
                  {selectedNode.id}
                </div>
                <Row label="Model" value={String(selectedNode.inspect?.model ?? '—')} />
                <Row label="Seed" value={String(selectedNode.inspect?.seed ?? '—')} />
                <Row
                  label="Cost"
                  value={
                    selectedNode.inspect?.costUsd != null
                      ? `$${Number(selectedNode.inspect.costUsd).toFixed(3)}`
                      : '—'
                  }
                />
                <div>
                  <div className="text-[10px] uppercase text-cinema-muted mb-1">Prompt</div>
                  <p className="text-[11px] leading-relaxed text-cinema-text/90 whitespace-pre-wrap">
                    {selectedNode.inspect?.prompt ?? '—'}
                  </p>
                </div>
                {selectedNode.stale && (
                  <div className={clsx('text-[11px] text-cinema-warning')}>Marked stale</div>
                )}
              </div>
            ) : (
              <p className="text-[12px] text-cinema-muted">Click a node to inspect.</p>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

function InfoCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-md border border-cinema-border bg-cinema-panel p-3">
      <div className="text-[11px] uppercase tracking-[0.1em] text-cinema-muted font-semibold">
        {title}
      </div>
      <p className="text-[12.5px] mt-1.5 text-cinema-text leading-relaxed">{body}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2 border-b border-cinema-border/60 py-1">
      <span className="text-cinema-muted">{label}</span>
      <span className="font-mono text-right truncate">{value}</span>
    </div>
  );
}

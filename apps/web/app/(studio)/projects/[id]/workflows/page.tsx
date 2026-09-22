'use client';

import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Input, Spinner } from '@studio-os/ui';
import {
  workflowsApi,
  type WorkflowDefinitionDto,
  type WorkflowEdgeDto,
  type WorkflowNodeDto,
} from '@/lib/api';
import clsx from 'clsx';

const DEFAULT_NODES: WorkflowNodeDto[] = [
  { key: 'validate', type: 'validate', label: 'Validate', positionX: 40, positionY: 60 },
  { key: 'route', type: 'route', label: 'Route', positionX: 260, positionY: 60, config: { route: 'fast' } },
  { key: 'estimate', type: 'estimate', label: 'Estimate', positionX: 480, positionY: 20 },
  { key: 'budget', type: 'budget_check', label: 'Budget', positionX: 480, positionY: 120 },
  { key: 'submit', type: 'submit', label: 'Submit', positionX: 700, positionY: 60, fanOut: true },
  { key: 'notify', type: 'notify', label: 'Notify', positionX: 920, positionY: 60 },
];

const DEFAULT_EDGES: WorkflowEdgeDto[] = [
  { sourceKey: 'validate', targetKey: 'route' },
  { sourceKey: 'route', targetKey: 'estimate', condition: { field: 'route', equals: 'fast' } },
  { sourceKey: 'route', targetKey: 'budget', condition: { field: 'route', equals: 'safe' } },
  { sourceKey: 'estimate', targetKey: 'submit' },
  { sourceKey: 'budget', targetKey: 'submit' },
  { sourceKey: 'submit', targetKey: 'notify' },
];

export default function WorkflowsPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const qc = useQueryClient();
  const [name, setName] = useState('Generation pipeline');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [routeInput, setRouteInput] = useState('fast');

  const listQuery = useQuery({
    queryKey: ['workflows', projectId],
    queryFn: () => workflowsApi.list(projectId),
    enabled: Boolean(projectId),
  });
  const detailQuery = useQuery({
    queryKey: ['workflow', selectedId],
    queryFn: () => workflowsApi.get(selectedId!),
    enabled: Boolean(selectedId),
  });
  const runsQuery = useQuery({
    queryKey: ['workflow-runs', projectId, selectedId],
    queryFn: () => workflowsApi.listRuns(projectId, selectedId ?? undefined),
    enabled: Boolean(projectId),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      workflowsApi.create(projectId, {
        name: name.trim() || 'Untitled workflow',
        entry: 'validate',
        nodes: DEFAULT_NODES,
        edges: DEFAULT_EDGES,
        status: 'active',
      }),
    onSuccess: (def) => {
      setSelectedId(def.id);
      void qc.invalidateQueries({ queryKey: ['workflows', projectId] });
    },
  });

  const runMutation = useMutation({
    mutationFn: () =>
      workflowsApi.startRun(selectedId!, {
        input: { route: routeInput, estimateUsd: 1.2, budgetUsd: 10 },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['workflow-runs', projectId] });
    },
  });

  const def = detailQuery.data as WorkflowDefinitionDto | undefined;
  const nodes = useMemo(() => {
    const raw = def?.nodes ?? [];
    return raw.map((n, i) => ({
      ...n,
      x: n.positionX ?? 40 + (i % 4) * 200,
      y: n.positionY ?? 40 + Math.floor(i / 4) * 90,
    }));
  }, [def?.nodes]);
  const edges = def?.edges ?? [];
  const nodeMap = Object.fromEntries(nodes.map((n) => [n.key, n]));

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="border-b border-cinema-border px-4 py-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[11px] uppercase tracking-[0.14em] text-cinema-muted font-semibold">
            Workflows
          </div>
          <h1 className="text-[16px] font-semibold">Visual builder</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Workflow name"
            className="w-[180px]"
          />
          <Button
            type="button"
            size="sm"
            disabled={createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            New graph
          </Button>
          <Input
            value={routeInput}
            onChange={(e) => setRouteInput(e.target.value)}
            placeholder="route"
            className="w-[100px]"
          />
          <Button
            type="button"
            size="sm"
            disabled={!selectedId || runMutation.isPending}
            onClick={() => runMutation.mutate()}
          >
            Run
          </Button>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex">
        <aside className="w-[220px] shrink-0 border-r border-cinema-border p-2 overflow-y-auto space-y-1">
          {listQuery.isLoading ? (
            <Spinner size={14} />
          ) : (listQuery.data ?? []).length === 0 ? (
            <p className="text-[12px] text-cinema-muted p-2">No workflows yet.</p>
          ) : (
            (listQuery.data ?? []).map((w) => (
              <button
                key={w.id}
                type="button"
                onClick={() => setSelectedId(w.id)}
                className={clsx(
                  'w-full text-left rounded px-2 py-1.5 text-[12px]',
                  selectedId === w.id
                    ? 'bg-cinema-accent/10 text-cinema-accent'
                    : 'text-cinema-muted hover:bg-cinema-raised',
                )}
              >
                <div className="truncate font-medium text-cinema-text">{w.name}</div>
                <div className="text-[10px] font-mono">{w.status}</div>
              </button>
            ))
          )}
        </aside>

        <div className="flex-1 min-h-0 overflow-auto p-4 studio-grid-bg">
          {!selectedId ? (
            <div className="h-full flex items-center justify-center text-[13px] text-cinema-muted">
              Select or create a workflow graph.
            </div>
          ) : detailQuery.isLoading ? (
            <div className="flex justify-center pt-12">
              <Spinner label="Loading graph…" size={18} />
            </div>
          ) : (
            <svg
              viewBox={`0 0 ${Math.max(720, nodes.length * 160)} ${Math.max(280, nodes.length * 50)}`}
              className="w-full min-w-[720px] h-auto rounded-lg border border-cinema-border bg-cinema-panel/80"
            >
              {edges.map((e, i) => {
                const a = nodeMap[e.sourceKey];
                const b = nodeMap[e.targetKey];
                if (!a || !b) return null;
                const conditional = Boolean(e.condition && !e.condition.always);
                return (
                  <line
                    key={`${e.sourceKey}-${e.targetKey}-${i}`}
                    x1={a.x + 70}
                    y1={a.y + 18}
                    x2={b.x}
                    y2={b.y + 18}
                    stroke={conditional ? '#fbbf24' : '#2a3140'}
                    strokeWidth={1.5}
                    strokeDasharray={conditional ? '4 3' : undefined}
                  />
                );
              })}
              {nodes.map((n) => (
                <g key={n.key}>
                  <rect
                    x={n.x}
                    y={n.y}
                    width={140}
                    height={36}
                    rx={6}
                    fill="#12151a"
                    stroke={n.fanOut ? '#6ee7b7' : '#7dd3fc'}
                    strokeWidth={1.25}
                  />
                  <text
                    x={n.x + 10}
                    y={n.y + 22}
                    fill="#e8eaed"
                    fontSize={11}
                    fontFamily="ui-monospace, monospace"
                  >
                    {(n.label ?? n.key).slice(0, 18)}
                  </text>
                </g>
              ))}
            </svg>
          )}
        </div>

        <aside className="w-[260px] shrink-0 border-l border-cinema-border p-3 overflow-y-auto">
          <div className="text-[11px] uppercase tracking-wide text-cinema-muted font-semibold mb-2">
            Runs
          </div>
          {(runsQuery.data ?? []).slice(0, 12).map((r) => (
            <div key={r.id} className="mb-2 rounded border border-cinema-border p-2 text-[11px]">
              <div className="flex justify-between gap-2">
                <span className="font-mono truncate">{r.id.slice(0, 8)}</span>
                <Badge tone={r.status === 'completed' ? 'accent' : 'warning'}>{r.status}</Badge>
              </div>
              <div className="text-cinema-muted mt-1">
                {(r.steps?.length ?? 0)} steps
                {r.error ? ` · ${r.error}` : ''}
              </div>
            </div>
          ))}
          {(runsQuery.data ?? []).length === 0 && (
            <p className="text-[12px] text-cinema-muted">Run a graph to see history.</p>
          )}
        </aside>
      </div>
    </div>
  );
}

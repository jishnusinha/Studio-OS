'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Input, Panel, Spinner } from '@studio-os/ui';
import {
  authApi,
  projectsApi,
  trainingApi,
  type AdapterDto,
  type TrainingRunDto,
} from '@/lib/api';

export default function AdminFineTuningPage() {
  const qc = useQueryClient();
  const meQuery = useQuery({ queryKey: ['me'], queryFn: () => authApi.me() });
  const [workspaceId, setWorkspaceId] = useState<string>('');
  const [projectId, setProjectId] = useState<string>('');
  const [datasetName, setDatasetName] = useState('Character refs');
  const [runName, setRunName] = useState('');
  const [baseModel, setBaseModel] = useState('mock-base');
  const [rank, setRank] = useState(16);
  const [selectedRun, setSelectedRun] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);

  useEffect(() => {
    if (meQuery.data?.workspaces?.[0]?.id) setWorkspaceId(meQuery.data.workspaces[0].id);
  }, [meQuery.data?.workspaces]);

  const projectsQuery = useQuery({
    queryKey: ['projects', workspaceId],
    queryFn: () => projectsApi.listByWorkspace(workspaceId),
    enabled: Boolean(workspaceId),
  });

  useEffect(() => {
    if (!projectId && projectsQuery.data?.[0]?.id) setProjectId(projectsQuery.data[0].id);
  }, [projectsQuery.data, projectId]);

  const effectiveProjectId = projectId || (projectsQuery.data?.[0]?.id ?? '');

  const datasetsQuery = useQuery({
    queryKey: ['training', 'datasets', effectiveProjectId],
    queryFn: () => trainingApi.listDatasets(effectiveProjectId),
    enabled: Boolean(effectiveProjectId),
  });
  const runsQuery = useQuery({
    queryKey: ['training', 'runs', effectiveProjectId],
    queryFn: () => trainingApi.listRuns(effectiveProjectId),
    enabled: Boolean(effectiveProjectId),
  });
  const adaptersQuery = useQuery({
    queryKey: ['training', 'adapters', effectiveProjectId],
    queryFn: () => trainingApi.listAdapters(effectiveProjectId),
    enabled: Boolean(effectiveProjectId),
  });
  const runDetailQuery = useQuery({
    queryKey: ['training', 'run', selectedRun],
    queryFn: () => trainingApi.getRun(selectedRun!),
    enabled: Boolean(selectedRun),
  });

  const pushLog = (line: string) => setLog((prev) => [line, ...prev].slice(0, 14));

  const createDataset = useMutation({
    mutationFn: () =>
      trainingApi.createDataset(effectiveProjectId, {
        name: datasetName.trim(),
        type: 'image',
        consent: { granted: true, rightsCleared: true },
      }),
    onSuccess: (ds) => {
      pushLog(`Dataset ${ds.name} created (consent gated)`);
      void qc.invalidateQueries({ queryKey: ['training', 'datasets'] });
    },
    onError: (err) => pushLog(`Dataset failed: ${(err as Error).message}`),
  });

  const launch = useMutation({
    mutationFn: (datasetId: string) =>
      trainingApi.launchFineTune(effectiveProjectId, {
        name: runName.trim() || undefined,
        datasetId,
        type: 'lora',
        baseModel,
        rank,
      }),
    onSuccess: (res) => {
      setSelectedRun(res.run.id);
      pushLog(
        `Launched ${res.run.name} · estimate $${res.costEstimateUsd.toFixed(4)} · adapter ${res.adapter.id.slice(0, 8)}`,
      );
      void qc.invalidateQueries({ queryKey: ['training'] });
    },
    onError: (err) => pushLog(`Launch failed: ${(err as Error).message}`),
  });

  const appendMetrics = useMutation({
    mutationFn: (runId: string) =>
      trainingApi.appendMetrics(runId, {
        metrics: [
          { step: 100, name: 'loss', value: 0.42 },
          { step: 100, name: 'lr', value: 1e-4 },
        ],
      }),
    onSuccess: () => {
      pushLog('Appended metrics + checkpoint');
      void qc.invalidateQueries({ queryKey: ['training'] });
    },
  });

  const promote = useMutation({
    mutationFn: (adapterId: string) => trainingApi.promoteAdapter(adapterId, { publish: true }),
    onSuccess: (res) => {
      pushLog(`Promoted adapter → Model Hub ${(res.model as { id?: string })?.id ?? ''}`);
      void qc.invalidateQueries({ queryKey: ['training'] });
      void qc.invalidateQueries({ queryKey: ['models'] });
    },
    onError: (err) => pushLog(`Promote failed: ${(err as Error).message}`),
  });

  const datasets = datasetsQuery.data ?? [];
  const runs = (runsQuery.data ?? []) as TrainingRunDto[];
  const adapters = (adaptersQuery.data ?? []) as AdapterDto[];

  return (
    <div className="h-full overflow-y-auto">
      <div className="border-b border-cinema-border px-4 py-3">
        <div className="text-[11px] uppercase tracking-[0.14em] text-cinema-muted font-semibold">
          Admin
        </div>
        <h1 className="text-[16px] font-semibold">Fine-tuning center</h1>
        <p className="text-[12px] text-cinema-muted mt-1">
          Consent-gated datasets → LoRA runs with cost estimate → checkpoints → promote to Model Hub
        </p>
      </div>

      <div className="p-4 grid xl:grid-cols-[320px_1fr_280px] gap-4">
        <Panel title="Launch" flush>
          <div className="p-3 space-y-3">
            <label className="block text-[11px] text-cinema-muted uppercase tracking-wide">
              Project
              <select
                className="mt-1 w-full rounded border border-cinema-border bg-cinema-bg px-2 py-1.5 text-[12px]"
                value={effectiveProjectId}
                onChange={(e) => setProjectId(e.target.value)}
              >
                {(projectsQuery.data ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <Input
              label="Dataset name"
              value={datasetName}
              onChange={(e) => setDatasetName(e.target.value)}
            />
            <Button
              type="button"
              disabled={!effectiveProjectId || createDataset.isPending}
              onClick={() => createDataset.mutate()}
            >
              Create dataset (consent)
            </Button>
            <Input
              label="Run name"
              value={runName}
              onChange={(e) => setRunName(e.target.value)}
              placeholder="optional"
            />
            <Input
              label="Base model"
              value={baseModel}
              onChange={(e) => setBaseModel(e.target.value)}
            />
            <Input
              label="LoRA rank"
              type="number"
              value={String(rank)}
              onChange={(e) => setRank(Number(e.target.value) || 16)}
            />
            <div className="space-y-1.5">
              <div className="text-[11px] text-cinema-muted">Datasets</div>
              {datasetsQuery.isLoading ? (
                <Spinner size={14} />
              ) : datasets.length === 0 ? (
                <p className="text-[12px] text-cinema-muted">No datasets yet.</p>
              ) : (
                datasets.map((d) => (
                  <div
                    key={d.id}
                    className="flex items-center justify-between gap-2 rounded border border-cinema-border px-2 py-1.5"
                  >
                    <div className="min-w-0">
                      <div className="text-[12px] truncate">{d.name}</div>
                      <div className="text-[10px] text-cinema-muted font-mono">{d.type}</div>
                    </div>
                    <Button
                      size="sm"
                      type="button"
                      disabled={launch.isPending}
                      onClick={() => launch.mutate(d.id)}
                    >
                      Train
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
        </Panel>

        <div className="space-y-4 min-w-0">
          <Panel title="Training runs" flush>
            <div className="p-3 space-y-2">
              {runsQuery.isLoading ? (
                <Spinner label="Loading runs…" size={16} />
              ) : runs.length === 0 ? (
                <p className="text-[12px] text-cinema-muted">No runs yet.</p>
              ) : (
                runs.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setSelectedRun(r.id)}
                    className="w-full text-left rounded border border-cinema-border px-3 py-2 hover:border-cinema-accent"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[13px] font-medium truncate">{r.name}</span>
                      <Badge tone={r.status === 'completed' ? 'accent' : 'warning'}>
                        {r.status}
                      </Badge>
                    </div>
                    <div className="text-[11px] text-cinema-muted mt-0.5 font-mono">
                      est. ${Number(r.costEstimateUsd ?? 0).toFixed(4)}
                    </div>
                  </button>
                ))
              )}
            </div>
          </Panel>

          {selectedRun && (
            <Panel title="Run detail" flush>
              <div className="p-3 space-y-2 text-[12px]">
                {runDetailQuery.isLoading ? (
                  <Spinner size={14} />
                ) : (
                  <>
                    <div className="font-mono text-[11px] text-cinema-muted break-all">
                      {selectedRun}
                    </div>
                    <div>
                      Checkpoints: {runDetailQuery.data?.checkpoints?.length ?? 0} · Metrics:{' '}
                      {runDetailQuery.data?.metrics?.length ?? 0}
                    </div>
                    <Button
                      size="sm"
                      type="button"
                      disabled={appendMetrics.isPending}
                      onClick={() => appendMetrics.mutate(selectedRun)}
                    >
                      Append sample metrics
                    </Button>
                  </>
                )}
              </div>
            </Panel>
          )}

          <Panel title="Adapters" flush>
            <div className="p-3 space-y-2">
              {adapters.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between gap-2 rounded border border-cinema-border px-2 py-1.5"
                >
                  <div className="min-w-0">
                    <div className="text-[12px] truncate">{a.name}</div>
                    <div className="text-[10px] text-cinema-muted">
                      rank {a.rank} · {a.baseModel} · {a.status}
                      {a.modelHubId ? ` · hub:${a.modelHubId}` : ''}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    type="button"
                    disabled={promote.isPending || a.status === 'published'}
                    onClick={() => promote.mutate(a.id)}
                  >
                    Promote
                  </Button>
                </div>
              ))}
              {adapters.length === 0 && (
                <p className="text-[12px] text-cinema-muted">No adapters yet.</p>
              )}
            </div>
          </Panel>
        </div>

        <Panel title="Activity" flush>
          <div className="p-3 space-y-1.5 max-h-[480px] overflow-y-auto">
            {log.length === 0 ? (
              <p className="text-[12px] text-cinema-muted">Actions appear here.</p>
            ) : (
              log.map((line, i) => (
                <div key={`${i}-${line}`} className="text-[11px] font-mono text-cinema-text/90">
                  {line}
                </div>
              ))
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}

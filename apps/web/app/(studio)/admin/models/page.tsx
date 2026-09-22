'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Spinner, Badge, Panel, Button, Input, Textarea, friendlyModelLabel } from '@studio-os/ui';
import { modelsApi, gpuApi, type ModelDto } from '@/lib/api';

type FlowStep = 'idle' | 'added' | 'connected' | 'generated' | 'published';

export default function AdminModelsPage() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ['models', 'all'],
    queryFn: () => modelsApi.list({ all: true }),
  });

  const endpointsQuery = useQuery({
    queryKey: ['gpu-endpoints'],
    queryFn: () => gpuApi.listEndpoints(),
  });

  const [form, setForm] = useState({
    id: '',
    providerId: 'mock',
    name: '',
    capabilities: 'text.generate',
    parameterSchema:
      '{\n  "temperature": { "type": "number", "minimum": 0, "maximum": 2, "default": 0.7 }\n}',
  });
  const [endpointForm, setEndpointForm] = useState({
    name: '',
    baseUrl: 'http://127.0.0.1:8188',
    kind: 'openai-compatible',
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [flow, setFlow] = useState<FlowStep>('idle');
  const [log, setLog] = useState<string[]>([]);

  const models = data ?? [];
  const selected = models.find((m) => m.id === selectedId) ?? null;

  const pushLog = (line: string) => setLog((prev) => [line, ...prev].slice(0, 12));

  const createMutation = useMutation({
    mutationFn: () =>
      modelsApi.create({
        id: form.id.trim(),
        providerId: form.providerId.trim(),
        name: form.name.trim() || form.id.trim(),
        capabilities: form.capabilities
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        parameterSchema: JSON.parse(form.parameterSchema || '{}') as Record<string, unknown>,
        published: false,
      }),
    onSuccess: (m) => {
      setSelectedId(m.id);
      setFlow('added');
      pushLog(`Added model ${m.id}`);
      void qc.invalidateQueries({ queryKey: ['models'] });
    },
    onError: (err) => pushLog(`Add failed: ${(err as Error).message}`),
  });

  const connectMutation = useMutation({
    mutationFn: (id: string) => modelsApi.testConnection(id),
    onSuccess: (res, id) => {
      setFlow(res.ok ? 'connected' : 'added');
      pushLog(res.ok ? `Connection OK (${res.providerId})` : `Connection failed: ${res.message}`);
      setSelectedId(id);
    },
  });

  const generateMutation = useMutation({
    mutationFn: (id: string) => modelsApi.testGeneration(id, { prompt: 'StudioOS Model Hub test' }),
    onSuccess: (res) => {
      setFlow(res.ok ? 'generated' : 'connected');
      pushLog(
        res.ok
          ? `Generation OK: ${(res.text ?? '').slice(0, 120)}`
          : `Generation failed: ${res.error}`,
      );
    },
  });

  const publishMutation = useMutation({
    mutationFn: (id: string) => modelsApi.publish(id, true),
    onSuccess: (m) => {
      setFlow('published');
      pushLog(`Published ${m.id}`);
      void qc.invalidateQueries({ queryKey: ['models'] });
    },
  });

  const createEndpointMutation = useMutation({
    mutationFn: () =>
      gpuApi.createEndpoint({
        name: endpointForm.name.trim() || 'Local GPU',
        baseUrl: endpointForm.baseUrl.trim(),
        kind: endpointForm.kind,
      }),
    onSuccess: () => {
      pushLog('Inference endpoint registered');
      void qc.invalidateQueries({ queryKey: ['gpu-endpoints'] });
      setEndpointForm((f) => ({ ...f, name: '' }));
    },
    onError: (err) => pushLog(`Endpoint failed: ${(err as Error).message}`),
  });

  const healthMutation = useMutation({
    mutationFn: (id: string) => gpuApi.healthCheck(id),
    onSuccess: (res) => {
      const health = res.health as { ok?: boolean; message?: string } | undefined;
      pushLog(
        health?.ok ? `Endpoint healthy: ${health.message}` : `Unhealthy: ${health?.message}`,
      );
      void qc.invalidateQueries({ queryKey: ['gpu-endpoints'] });
    },
  });

  return (
    <div className="h-full overflow-y-auto">
      <div className="border-b border-cinema-border px-4 py-3">
        <div className="text-[11px] uppercase tracking-[0.14em] text-cinema-muted font-semibold">
          Admin
        </div>
        <h1 className="text-[16px] font-semibold">Model Hub</h1>
        <p className="text-[12px] text-cinema-muted mt-1">
          Add Model → Test Connection → Test Generation → Publish
        </p>
      </div>

      <div className="p-4 grid xl:grid-cols-[360px_1fr] gap-4">
        <div className="space-y-3">
          <Panel title="Add model" flush>
            <div className="p-3 space-y-3">
              <Input
                label="Model id"
                value={form.id}
                onChange={(e) => setForm((f) => ({ ...f, id: e.target.value }))}
                placeholder="studio-custom-llm"
              />
              <Input
                label="Provider id"
                value={form.providerId}
                onChange={(e) => setForm((f) => ({ ...f, providerId: e.target.value }))}
              />
              <Input
                label="Display name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
              <Input
                label="Capabilities (comma)"
                value={form.capabilities}
                onChange={(e) => setForm((f) => ({ ...f, capabilities: e.target.value }))}
              />
              <Textarea
                label="parameterSchema (JSON)"
                value={form.parameterSchema}
                onChange={(e) => setForm((f) => ({ ...f, parameterSchema: e.target.value }))}
                rows={6}
              />
              <Button
                type="button"
                disabled={!form.id.trim() || createMutation.isPending}
                onClick={() => createMutation.mutate()}
              >
                {createMutation.isPending ? 'Adding…' : 'Add Model'}
              </Button>
            </div>
          </Panel>

          <Panel title="Self-hosted GPU endpoints" subtitle="Dormant until configured" flush>
            <div className="p-3 space-y-3">
              <Input
                label="Name"
                value={endpointForm.name}
                onChange={(e) => setEndpointForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="ComfyUI local"
              />
              <Input
                label="Base URL"
                value={endpointForm.baseUrl}
                onChange={(e) => setEndpointForm((f) => ({ ...f, baseUrl: e.target.value }))}
              />
              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-[0.1em] text-cinema-muted font-semibold">
                  Kind
                </span>
                <select
                  value={endpointForm.kind}
                  onChange={(e) => setEndpointForm((f) => ({ ...f, kind: e.target.value }))}
                  className="h-9 rounded-md border border-cinema-border bg-cinema-bg px-2 text-[13px]"
                >
                  <option value="openai-compatible">OpenAI-compatible</option>
                  <option value="comfyui">ComfyUI</option>
                </select>
              </label>
              <Button
                type="button"
                disabled={!endpointForm.baseUrl.trim() || createEndpointMutation.isPending}
                onClick={() => createEndpointMutation.mutate()}
              >
                {createEndpointMutation.isPending ? 'Saving…' : 'Add endpoint'}
              </Button>
              <ul className="space-y-2">
                {(endpointsQuery.data?.endpoints ?? []).map((ep) => (
                  <li
                    key={String(ep.id)}
                    className="rounded border border-cinema-border px-2 py-2 text-[12px]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium truncate">{String(ep.name)}</span>
                      <Badge tone={ep.healthy ? 'accent' : 'neutral'}>
                        {ep.healthy ? 'healthy' : 'idle'}
                      </Badge>
                    </div>
                    <div className="text-[10px] font-mono text-cinema-muted truncate mt-1">
                      {String(ep.baseUrl)}
                    </div>
                    <button
                      type="button"
                      className="mt-2 h-7 px-2 rounded border border-cinema-border text-[11px]"
                      onClick={() => healthMutation.mutate(String(ep.id))}
                    >
                      Health check
                    </button>
                  </li>
                ))}
                {endpointsQuery.data?.endpoints?.length === 0 && (
                  <li className="text-[11px] text-cinema-muted">
                    No endpoints — mocks remain default.
                  </li>
                )}
              </ul>
            </div>
          </Panel>
        </div>

        <div className="space-y-3">
          {selected && (
            <Panel
              title={selected.id.includes('mock') ? friendlyModelLabel(selected.id) : selected.name}
              subtitle={`Flow: ${flow}`}
              actions={
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    className="h-7 px-2 rounded border border-cinema-border text-[11px]"
                    onClick={() => connectMutation.mutate(selected.id)}
                  >
                    Test Connection
                  </button>
                  <button
                    type="button"
                    className="h-7 px-2 rounded border border-cinema-border text-[11px]"
                    disabled={flow === 'idle'}
                    onClick={() => generateMutation.mutate(selected.id)}
                  >
                    Test Generation
                  </button>
                  <button
                    type="button"
                    className="h-7 px-2 rounded border border-cinema-accent/40 text-[11px] text-cinema-accent"
                    disabled={flow !== 'generated' && flow !== 'connected' && !selected.published}
                    onClick={() => publishMutation.mutate(selected.id)}
                  >
                    Publish
                  </button>
                </div>
              }
            >
              <pre className="text-[10px] font-mono text-cinema-muted overflow-auto max-h-28">
                {JSON.stringify(selected.parameterSchema ?? {}, null, 2)}
              </pre>
            </Panel>
          )}

          {log.length > 0 && (
            <Panel title="Activity" flush>
              <ul className="p-3 space-y-1 text-[11px] font-mono text-cinema-muted">
                {log.map((line, i) => (
                  <li key={`${i}-${line.slice(0, 24)}`}>{line}</li>
                ))}
              </ul>
            </Panel>
          )}

          {isLoading && (
            <div className="py-12 flex justify-center">
              <Spinner label="Loading models…" />
            </div>
          )}
          {error && <div className="text-[12px] text-cinema-danger">{(error as Error).message}</div>}

          <div className="grid md:grid-cols-2 gap-3">
            {models.map((m: ModelDto) => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  setSelectedId(m.id);
                  setFlow(m.published ? 'published' : 'idle');
                }}
                className={`text-left rounded-lg border px-3 py-3 ${
                  selectedId === m.id
                    ? 'border-cinema-accent/50 bg-cinema-panel'
                    : 'border-cinema-border bg-cinema-panel/60'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[13px] font-semibold truncate">
                    {m.id.includes('mock') ? friendlyModelLabel(m.id) : m.name}
                  </div>
                  <Badge tone={m.published ? 'accent' : 'neutral'}>
                    {m.published ? 'published' : 'draft'}
                  </Badge>
                </div>
                <div className="text-[11px] text-cinema-muted font-mono mt-1 truncate">{m.id}</div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {(m.capabilities ?? []).map((c) => (
                    <Badge key={c} tone="neutral">
                      {c}
                    </Badge>
                  ))}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

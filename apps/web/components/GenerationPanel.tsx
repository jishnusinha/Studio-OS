'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  DepthSegmentedControl,
  ModelSelector,
  SmartGenerateButton,
  Input,
  Textarea,
  Select,
  ProgressBar,
  Panel,
  friendlyModelLabel,
  type ModelPreset,
} from '@studio-os/ui';
import type { CostEstimateDto } from '@/lib/api';
import { generationApi, jobsApi, modelsApi, asNumber } from '@/lib/api';
import { useStudioStore } from '@/lib/store';

export interface GenerationPanelProps {
  projectId: string;
  workspaceId?: string | null;
  capability: 'image.generate' | 'video.generate';
  title: string;
}

type ParamDef = {
  type?: string;
  title?: string;
  description?: string;
  minimum?: number;
  maximum?: number;
  default?: unknown;
  values?: Array<string | number>;
  required?: boolean;
};

function DynamicSchemaFields({
  schema,
  values,
  onChange,
}: {
  schema: Record<string, ParamDef>;
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}) {
  const entries = Object.entries(schema);
  if (entries.length === 0) {
    return <p className="text-[11px] text-cinema-muted">No parameterSchema on this model.</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      {entries.map(([key, def]) => {
        const label = def.title ?? key;
        const value = values[key] ?? def.default ?? '';
        if (def.type === 'enum' && def.values?.length) {
          return (
            <Select
              key={key}
              label={label}
              value={String(value)}
              onChange={(e) => onChange(key, e.target.value)}
              options={def.values.map((v) => ({ value: String(v), label: String(v) }))}
            />
          );
        }
        if (def.type === 'boolean') {
          return (
            <Select
              key={key}
              label={label}
              value={value ? 'true' : 'false'}
              onChange={(e) => onChange(key, e.target.value === 'true')}
              options={[
                { value: 'true', label: 'true' },
                { value: 'false', label: 'false' },
              ]}
            />
          );
        }
        const inputType =
          def.type === 'integer' || def.type === 'number' ? 'number' : 'text';
        return (
          <Input
            key={key}
            label={label}
            type={inputType}
            min={def.minimum}
            max={def.maximum}
            value={value == null ? '' : String(value)}
            onChange={(e) => {
              const raw = e.target.value;
              if (def.type === 'integer') onChange(key, raw === '' ? undefined : Number.parseInt(raw, 10));
              else if (def.type === 'number') onChange(key, raw === '' ? undefined : Number(raw));
              else onChange(key, raw);
            }}
          />
        );
      })}
    </div>
  );
}

export function GenerationPanel({ projectId, workspaceId, capability, title }: GenerationPanelProps) {
  const depthMode = useStudioStore((s) => s.depthMode);
  const setDepthMode = useStudioStore((s) => s.setDepthMode);
  const selection = useStudioStore((s) => s.selection);

  const [prompt, setPrompt] = useState(
    capability === 'image.generate'
      ? 'Cinematic still of Sarah discovering a mysterious tape, teal/amber night apartment'
      : 'Slow dolly in on Sarah as she reaches for the tape, handheld tension',
  );
  const [aspect, setAspect] = useState('16:9');
  const [duration, setDuration] = useState('5');
  const [takeCount, setTakeCount] = useState(2);
  const [preset, setPreset] = useState<ModelPreset>('auto');
  const [manualModelId, setManualModelId] = useState<string>('');
  const [estimate, setEstimate] = useState<CostEstimateDto | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [schemaValues, setSchemaValues] = useState<Record<string, unknown>>({});

  const [lens, setLens] = useState('50mm');
  const [motion, setMotion] = useState('dolly_in');
  const [emotion, setEmotion] = useState('anxious');

  const modelsQuery = useQuery({
    queryKey: ['models'],
    queryFn: () => modelsApi.list(),
    retry: false,
  });

  const manualModels = useMemo(() => {
    const list = modelsQuery.data ?? [];
    const filtered = list.filter((m) =>
      (m.capabilities ?? []).some((c) => c.startsWith(capability.split('.')[0]!)),
    );
    const source = filtered.length ? filtered : list;
    return source.map((m) => ({
      id: m.id,
      label: m.id.includes('mock') ? friendlyModelLabel(m.id) : m.name,
    }));
  }, [modelsQuery.data, capability]);

  const activeModel = useMemo(() => {
    const list = modelsQuery.data ?? [];
    const id = preset === 'manual' ? manualModelId : estimate?.modelId;
    return list.find((m) => m.id === id) ?? list.find((m) =>
      (m.capabilities ?? []).some((c) => c.startsWith(capability.split('.')[0]!)),
    );
  }, [modelsQuery.data, preset, manualModelId, estimate?.modelId, capability]);

  const parameterSchema = (activeModel?.parameterSchema ?? {}) as Record<string, ParamDef>;

  useEffect(() => {
    if (!manualModelId && manualModels[0]) setManualModelId(manualModels[0].id);
  }, [manualModelId, manualModels]);

  useEffect(() => {
    const defaults: Record<string, unknown> = {};
    for (const [key, def] of Object.entries(parameterSchema)) {
      if (def.default !== undefined) defaults[key] = def.default;
    }
    setSchemaValues(defaults);
  }, [activeModel?.id]);

  const buildRequest = () => {
    const shotDna =
      depthMode === 'quick'
        ? { aspectRatio: aspect, durationSec: Number(duration) || undefined }
        : {
            aspectRatio: aspect,
            durationSec: Number(duration) || undefined,
            camera: { lens, motion: { type: motion, intensity: 'subtle' } },
            subject: { emotion },
            look: { palette: 'teal_amber_muted', grain: '35mm_medium' },
          };

    return {
      capability,
      projectId,
      workspaceId: workspaceId ?? projectId,
      shotId: selection.kind === 'shot' ? selection.id : undefined,
      intent: {
        prompt,
        shotDna,
        parameters: { ...schemaValues },
        references: [],
      },
      constraints: {
        qualityMode: preset === 'cinematic' ? 'hero' : preset === 'economy' ? 'draft' : 'production',
        takeCount,
        modelId: preset === 'manual' ? manualModelId : undefined,
      },
    };
  };

  const estimateMutation = useMutation({
    mutationFn: () => generationApi.estimate(buildRequest()),
    onSuccess: (data) => setEstimate(data),
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      if (!estimate) await estimateMutation.mutateAsync();
      const res = await generationApi.generate(buildRequest());
      return 'job' in res && res.job ? res.job : (res as { id: string });
    },
    onSuccess: (job) => {
      if (job && 'id' in job) setActiveJobId(job.id as string);
    },
  });

  const jobQuery = useQuery({
    queryKey: ['job', activeJobId],
    queryFn: () => jobsApi.get(activeJobId!),
    enabled: Boolean(activeJobId),
    refetchInterval: (q) => {
      const status = q.state.data?.status;
      if (!status) return 1200;
      if (['completed', 'failed', 'cancelled'].includes(status)) return false;
      return 1000;
    },
  });

  const reason = {
    title: 'Recommended model',
    modelLabel: estimate ? friendlyModelLabel(estimate.modelId) : 'Studio Model',
    bullets: [
      'Character reference supported',
      `Native ${aspect}`,
      'Good camera movement',
      'Within project budget',
    ],
    estimatedUsd: estimate ? (estimate.minUsd + estimate.maxUsd) / 2 : undefined,
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="border-b border-cinema-border px-4 py-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.14em] text-cinema-muted font-semibold">{title}</div>
          <div className="text-[13px] text-cinema-muted mt-0.5">
            {selection.kind === 'shot' ? `Target: ${selection.label}` : 'No shot selected — generates as free asset'}
          </div>
        </div>
        <DepthSegmentedControl value={depthMode} onChange={setDepthMode} size="sm" />
      </div>

      <div className="grid lg:grid-cols-[1fr_300px] gap-0 min-h-[calc(100%-52px)]">
        <div className="p-4 space-y-4 border-r border-cinema-border">
          <Textarea
            label="What do you want to create?"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
          />

          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Aspect"
              value={aspect}
              onChange={(e) => setAspect(e.target.value)}
              options={[
                { value: '16:9', label: '16:9' },
                { value: '2.39:1', label: '2.39:1' },
                { value: '9:16', label: '9:16' },
                { value: '1:1', label: '1:1' },
              ]}
            />
            {capability === 'video.generate' ? (
              <Input label="Duration (sec)" value={duration} onChange={(e) => setDuration(e.target.value)} />
            ) : (
              <Input
                label="Takes"
                type="number"
                min={1}
                max={8}
                value={takeCount}
                onChange={(e) => setTakeCount(Number(e.target.value) || 1)}
              />
            )}
          </div>

          {depthMode !== 'quick' && (
            <Panel title="Director controls" flush>
              <div className="grid grid-cols-2 gap-3">
                <Input label="Lens" value={lens} onChange={(e) => setLens(e.target.value)} />
                <Select
                  label="Motion"
                  value={motion}
                  onChange={(e) => setMotion(e.target.value)}
                  options={[
                    { value: 'static', label: 'Static' },
                    { value: 'dolly_in', label: 'Dolly in' },
                    { value: 'handheld', label: 'Handheld' },
                    { value: 'orbit', label: 'Orbit' },
                    { value: 'pan', label: 'Pan' },
                  ]}
                />
                <Input label="Emotion" value={emotion} onChange={(e) => setEmotion(e.target.value)} />
                {capability === 'video.generate' && (
                  <Input
                    label="Takes"
                    type="number"
                    min={1}
                    max={8}
                    value={takeCount}
                    onChange={(e) => setTakeCount(Number(e.target.value) || 1)}
                  />
                )}
              </div>
            </Panel>
          )}

          {(depthMode === 'pro' || depthMode === 'director') && (
            <Panel
              title="Model parameters"
              subtitle={activeModel ? friendlyModelLabel(activeModel.id) : 'Select a model'}
              flush
            >
              <div className="p-3">
                <DynamicSchemaFields
                  schema={parameterSchema}
                  values={schemaValues}
                  onChange={(key, value) => setSchemaValues((prev) => ({ ...prev, [key]: value }))}
                />
              </div>
            </Panel>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => estimateMutation.mutate()}
              className="h-9 px-3 rounded-md border border-cinema-border bg-cinema-raised text-[12px] text-cinema-muted hover:text-cinema-text"
            >
              {estimateMutation.isPending ? 'Estimating…' : 'Refresh estimate'}
            </button>
          </div>

          {activeJobId && jobQuery.data && (
            <Panel title="Job progress" subtitle={friendlyModelLabel(jobQuery.data.modelId)}>
              <ProgressBar
                value={asNumber(jobQuery.data.progress)}
                label={jobQuery.data.status}
                tone={jobQuery.data.status === 'failed' ? 'danger' : 'accent'}
              />
              {jobQuery.data.error && (
                <p className="text-[12px] text-cinema-danger mt-2">{jobQuery.data.error}</p>
              )}
            </Panel>
          )}
        </div>

        <div className="p-4 space-y-4 bg-cinema-panel/40">
          <ModelSelector
            value={preset}
            onChange={setPreset}
            reason={reason}
            manualModels={manualModels}
            manualModelId={manualModelId}
            onManualModelChange={setManualModelId}
          />
          <SmartGenerateButton
            takeCount={takeCount}
            costMinUsd={estimate?.minUsd}
            costMaxUsd={estimate?.maxUsd}
            etaMinSec={estimate?.etaSec?.min}
            etaMaxSec={estimate?.etaSec?.max}
            estimating={estimateMutation.isPending}
            generating={generateMutation.isPending}
            onClick={() => {
              if (!estimate) {
                estimateMutation.mutate(undefined, {
                  onSuccess: () => generateMutation.mutate(),
                });
              } else {
                generateMutation.mutate();
              }
            }}
          />
          {generateMutation.isError && (
            <p className="text-[12px] text-cinema-danger">
              {(generateMutation.error as Error).message}
            </p>
          )}
          <p className="text-[11px] text-cinema-muted leading-relaxed">
            Controls below the prompt are rendered from the selected model&apos;s parameterSchema.
          </p>
        </div>
      </div>
    </div>
  );
}

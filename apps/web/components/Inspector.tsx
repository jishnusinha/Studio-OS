'use client';

import { useQuery } from '@tanstack/react-query';
import { Panel, StatusChip, Badge, Spinner } from '@studio-os/ui';
import { useStudioStore } from '@/lib/store';
import {
  assetsApi,
  commercialApi,
  jobsApi,
  storyApi,
  provenanceApi,
  asNumber,
  type AssetDto,
  type GenerationJobDto,
  type TakeDto,
} from '@/lib/api';
import { api } from '@/lib/api';

function Field({ label, value }: { label: string; value?: string | number | null }) {
  if (value == null || value === '') return null;
  return (
    <div className="grid grid-cols-[88px_1fr] gap-2 py-1.5 border-b border-cinema-border/60 last:border-0">
      <dt className="text-[10px] uppercase tracking-[0.08em] text-cinema-muted pt-0.5">{label}</dt>
      <dd className="text-[12.5px] text-cinema-text break-words">{String(value)}</dd>
    </div>
  );
}

function ShotDnaInspector({
  dna,
  code,
  status,
}: {
  dna: Record<string, unknown>;
  code?: string;
  status?: string;
}) {
  const shot = (dna.shot ?? {}) as Record<string, unknown>;
  const camera = (dna.camera ?? {}) as Record<string, unknown>;
  const motion = (camera.motion ?? {}) as Record<string, unknown>;
  const lighting = (dna.lighting ?? {}) as Record<string, unknown>;
  const subject = (dna.subject ?? {}) as Record<string, unknown>;
  const environment = (dna.environment ?? {}) as Record<string, unknown>;
  const look = (dna.look ?? {}) as Record<string, unknown>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-[13px] font-semibold">{code ?? 'Shot'}</div>
          <div className="text-[11px] text-cinema-muted mt-0.5">Shot DNA</div>
        </div>
        {status && <StatusChip status={status} />}
      </div>
      <dl>
        <Field label="Size" value={shot.size as string} />
        <Field label="Angle" value={shot.angle as string} />
        <Field label="Lens" value={camera.lens as string} />
        <Field label="Aperture" value={camera.aperture as string} />
        <Field
          label="Motion"
          value={
            motion.type
              ? `${motion.type}${motion.intensity ? ` · ${motion.intensity}` : ''}`
              : null
          }
        />
        <Field label="Key light" value={lighting.key as string} />
        <Field label="Contrast" value={lighting.contrast as string} />
        <Field label="Motivated" value={lighting.motivatedBy as string} />
        <Field label="Emotion" value={subject.emotion as string} />
        <Field label="Action" value={subject.action as string} />
        <Field label="Time" value={environment.time as string} />
        <Field label="Weather" value={environment.weather as string} />
        <Field label="Palette" value={look.palette as string} />
        <Field label="Grain" value={look.grain as string} />
        <Field label="Duration" value={dna.durationSec != null ? `${dna.durationSec}s` : null} />
        <Field label="Aspect" value={dna.aspectRatio as string} />
        <Field label="Direction" value={dna.direction as string} />
      </dl>
    </div>
  );
}

function TakePanel({ take }: { take: TakeDto }) {
  return (
    <dl>
      <Field label="Number" value={take.number} />
      <Field label="Status" value={take.status} />
      <Field label="Rating" value={take.rating} />
      <Field label="Selected" value={take.selected ? 'yes' : 'no'} />
      <Field label="Model" value={take.modelId} />
      <Field label="Cost" value={take.costUsd != null ? `$${asNumber(take.costUsd).toFixed(3)}` : null} />
      <Field label="Seed" value={take.seed} />
    </dl>
  );
}

function AssetPanel({ asset }: { asset: AssetDto }) {
  const meta = asset.metadata ?? {};
  const credentialsQuery = useQuery({
    queryKey: ['asset-credentials', asset.id],
    queryFn: () => provenanceApi.getCredentials(asset.id),
  });

  return (
    <div className="space-y-3">
      <dl>
        <Field label="Type" value={asset.type} />
        <Field label="Status" value={asset.status} />
        <Field label="Rating" value={asset.rating} />
        <Field label="MIME" value={asset.mimeType} />
        <Field label="Model" value={meta.modelId as string} />
        <Field label="Source" value={(meta.source as string) ?? (meta.providerId as string)} />
        <Field label="Scene" value={meta.sceneId as string} />
        <Field label="Character" value={(meta.character as string) ?? (meta.characterId as string)} />
      </dl>

      <Panel title="Content credentials" flush>
        <div className="p-3 space-y-2">
          {credentialsQuery.isLoading && <Spinner label="Loading credentials…" />}
          {credentialsQuery.error && (
            <p className="text-[11px] text-cinema-muted">
              {(credentialsQuery.error as Error).message}
            </p>
          )}
          {credentialsQuery.data && (
            <>
              <div className="flex flex-wrap gap-1.5">
                <Badge tone={credentialsQuery.data.credentials.length ? 'accent' : 'neutral'}>
                  {credentialsQuery.data.credentials.length
                    ? `${credentialsQuery.data.credentials.length} signed`
                    : 'unsigned'}
                </Badge>
                {credentialsQuery.data.actions[0]?.modelId != null && (
                  <Badge tone="neutral">
                    model {String(credentialsQuery.data.actions[0].modelId)}
                  </Badge>
                )}
                {credentialsQuery.data.ingredients.length > 0 && (
                  <Badge tone="neutral">
                    {credentialsQuery.data.ingredients.length} ingredients
                  </Badge>
                )}
              </div>
              {credentialsQuery.data.actions[0]?.prompt != null && (
                <p className="text-[11px] text-cinema-muted line-clamp-3">
                  {String(credentialsQuery.data.actions[0].prompt)}
                </p>
              )}
              {credentialsQuery.data.signatures[0] && (
                <p className="text-[10px] font-mono text-cinema-muted truncate">
                  {String(credentialsQuery.data.signatures[0].algorithm)} ·{' '}
                  {String(credentialsQuery.data.signatures[0].signature).slice(0, 24)}…
                </p>
              )}
              {credentialsQuery.data.credentials.length === 0 && (
                <p className="text-[11px] text-cinema-muted">
                  No C2PA credentials yet. Sign via API after generation.
                </p>
              )}
            </>
          )}
        </div>
      </Panel>
    </div>
  );
}

function JobPanel({ job }: { job: GenerationJobDto }) {
  return (
    <dl>
      <Field label="Capability" value={job.capability} />
      <Field label="Status" value={job.status} />
      <Field label="Progress" value={`${asNumber(job.progress)}%`} />
      <Field label="Model" value={job.modelId} />
      <Field label="Est. cost" value={job.estimatedCostUsd != null ? `$${asNumber(job.estimatedCostUsd).toFixed(3)}` : null} />
      <Field label="Actual" value={job.actualCostUsd != null ? `$${asNumber(job.actualCostUsd).toFixed(3)}` : null} />
      <Field label="Error" value={job.error} />
    </dl>
  );
}

export function Inspector() {
  const selection = useStudioStore((s) => s.selection);
  const projectId = useStudioStore((s) => s.projectId);

  const shotTakesQuery = useQuery({
    queryKey: ['inspector-takes', selection.id],
    queryFn: () => storyApi.listTakes(selection.id!),
    enabled: selection.kind === 'shot' && Boolean(selection.id),
  });

  const takeQuery = useQuery({
    queryKey: ['inspector-take', selection.id],
    queryFn: async () => {
      // Resolve take via shot takes list when only take id is known
      const shotId = (selection.meta?.shotId as string) ?? null;
      if (shotId) {
        const payload = await storyApi.listTakes(shotId);
        return payload.takes.find((t) => t.id === selection.id) ?? null;
      }
      return (selection.meta as unknown as TakeDto) ?? null;
    },
    enabled: selection.kind === 'take' && Boolean(selection.id),
  });

  const assetQuery = useQuery({
    queryKey: ['inspector-asset', selection.id],
    queryFn: () => assetsApi.get(selection.id!),
    enabled: selection.kind === 'asset' && Boolean(selection.id),
  });

  const jobQuery = useQuery({
    queryKey: ['inspector-job', selection.id],
    queryFn: () => jobsApi.get(selection.id!),
    enabled: selection.kind === 'job' && Boolean(selection.id),
  });

  const characterQuery = useQuery({
    queryKey: ['inspector-character', selection.id],
    queryFn: () => api<Record<string, unknown>>(`/characters/${selection.id}`),
    enabled: selection.kind === 'character' && Boolean(selection.id),
  });

  const brandQuery = useQuery({
    queryKey: ['inspector-brand', projectId],
    queryFn: () => commercialApi.getBrand(projectId!),
    enabled: selection.kind === 'brand' && Boolean(projectId),
  });

  const clipMeta = selection.kind === 'clip' ? selection.meta : null;
  const variantMeta = selection.kind === 'variant' ? selection.meta : null;

  const loading =
    (selection.kind === 'asset' && assetQuery.isLoading) ||
    (selection.kind === 'job' && jobQuery.isLoading) ||
    (selection.kind === 'character' && characterQuery.isLoading) ||
    (selection.kind === 'take' && takeQuery.isLoading);

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="h-10 shrink-0 px-3 border-b border-cinema-border flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-cinema-muted">
          Inspector
        </span>
        {selection.kind && <Badge tone="accent">{selection.kind}</Badge>}
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {!selection.kind || !selection.id ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center max-w-[200px]">
              <div className="text-[13px] font-medium text-cinema-text mb-1">Nothing selected</div>
              <p className="text-[11.5px] text-cinema-muted leading-relaxed">
                Click a shot, take, asset, job, character, clip, brand, or variant to inspect.
              </p>
            </div>
          </div>
        ) : loading ? (
          <div className="py-8 flex justify-center">
            <Spinner label="Loading…" />
          </div>
        ) : selection.kind === 'shot' ? (
          <div className="space-y-4">
            <ShotDnaInspector
              code={selection.label ?? undefined}
              status={(selection.meta?.status as string) ?? 'draft'}
              dna={(selection.meta?.shotDna as Record<string, unknown>) ?? {}}
            />
            {shotTakesQuery.data?.takes && shotTakesQuery.data.takes.length > 0 && (
              <Panel title="Takes" flush>
                <ul className="space-y-1">
                  {shotTakesQuery.data.takes.map((t) => (
                    <li key={t.id} className="text-[12px] flex justify-between gap-2">
                      <span>Take {t.number}</span>
                      <StatusChip status={t.status ?? 'draft'} />
                    </li>
                  ))}
                </ul>
              </Panel>
            )}
          </div>
        ) : selection.kind === 'take' ? (
          <Panel title={selection.label ?? `Take`} padded>
            {takeQuery.data ? (
              <TakePanel take={takeQuery.data} />
            ) : (
              <pre className="text-[11px] text-cinema-muted whitespace-pre-wrap font-mono">
                {JSON.stringify(selection.meta ?? { id: selection.id }, null, 2)}
              </pre>
            )}
          </Panel>
        ) : selection.kind === 'asset' ? (
          <Panel title={assetQuery.data?.name ?? selection.label ?? 'Asset'} padded>
            {assetQuery.data ? (
              <AssetPanel asset={assetQuery.data} />
            ) : (
              <p className="text-[12px] text-cinema-muted">Asset unavailable</p>
            )}
          </Panel>
        ) : selection.kind === 'job' ? (
          <Panel title={selection.label ?? 'Job'} padded>
            {jobQuery.data ? <JobPanel job={jobQuery.data} /> : null}
          </Panel>
        ) : selection.kind === 'character' ? (
          <Panel title={(characterQuery.data?.name as string) ?? selection.label ?? 'Character'} padded>
            <dl>
              <Field label="Name" value={(characterQuery.data?.name as string) ?? selection.label} />
              <Field label="Bio" value={(characterQuery.data?.bio as string) ?? null} />
              <Field
                label="Locked"
                value={characterQuery.data?.locked != null ? String(characterQuery.data.locked) : null}
              />
            </dl>
          </Panel>
        ) : selection.kind === 'clip' ? (
          <Panel title={selection.label ?? 'Clip'} padded>
            <dl>
              <Field label="Asset" value={(clipMeta?.assetId as string) ?? null} />
              <Field label="In" value={clipMeta?.sourceIn as number} />
              <Field label="Out" value={clipMeta?.sourceOut as number} />
              <Field label="Start" value={clipMeta?.timelineStart as number} />
              <Field label="Speed" value={clipMeta?.speed as number} />
            </dl>
          </Panel>
        ) : selection.kind === 'brand' ? (
          <Panel title={brandQuery.data?.name ?? selection.label ?? 'Brand'} padded>
            <dl>
              <Field label="Voice" value={brandQuery.data?.dna?.voice} />
              <Field label="Audience" value={brandQuery.data?.dna?.audience} />
              <Field label="CTA" value={brandQuery.data?.dna?.cta} />
              <Field label="Colors" value={brandQuery.data?.dna?.colors?.join(', ')} />
            </dl>
          </Panel>
        ) : selection.kind === 'variant' ? (
          <Panel title={selection.label ?? 'Variant'} padded>
            <dl>
              <Field label="Format" value={variantMeta?.format as string} />
              <Field label="Language" value={variantMeta?.language as string} />
              <Field label="Duration" value={variantMeta?.durationSec as number} />
              <Field label="Status" value={variantMeta?.status as string} />
            </dl>
          </Panel>
        ) : selection.kind === 'scene' ? (
          <Panel title={selection.label ?? 'Scene'} padded>
            <dl>
              <Field label="Heading" value={selection.label} />
              <Field label="Synopsis" value={(selection.meta?.synopsis as string) ?? null} />
              <Field label="Number" value={selection.meta?.number as number} />
            </dl>
          </Panel>
        ) : (
          <Panel title={selection.label ?? selection.kind} padded>
            <pre className="text-[11px] text-cinema-muted whitespace-pre-wrap font-mono">
              {JSON.stringify(selection.meta ?? { id: selection.id }, null, 2)}
            </pre>
          </Panel>
        )}
      </div>
    </div>
  );
}

'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Panel, StatusChip } from '@studio-os/ui';
import { useEffect, useState } from 'react';
import { commercialApi, type CampaignBeatDto } from '@/lib/api';

export function CampaignBuilder({
  projectId,
  selectedCampaignId,
  onSelectCampaign,
}: {
  projectId: string;
  selectedCampaignId: string | null;
  onSelectCampaign: (id: string) => void;
}) {
  const qc = useQueryClient();
  const templatesQuery = useQuery({
    queryKey: ['campaign-templates'],
    queryFn: () => commercialApi.listTemplates(),
  });
  const campaignsQuery = useQuery({
    queryKey: ['campaigns', projectId],
    queryFn: () => commercialApi.listCampaigns(projectId),
  });

  const [templateSlug, setTemplateSlug] = useState('product-hero');
  const [name, setName] = useState('');
  const [draftBeats, setDraftBeats] = useState<Record<string, { prompt: string; copy: string }>>({});
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const first = templatesQuery.data?.[0]?.slug;
    if (first && !templatesQuery.data?.some((t) => t.slug === templateSlug)) {
      setTemplateSlug(first);
    }
  }, [templatesQuery.data, templateSlug]);

  const campaign = (campaignsQuery.data ?? []).find((c) => c.id === selectedCampaignId) ?? null;
  const beats = campaign?.beats ?? [];

  useEffect(() => {
    if (!campaign?.beats) return;
    const next: Record<string, { prompt: string; copy: string }> = {};
    for (const b of campaign.beats) {
      next[b.id] = { prompt: b.prompt ?? '', copy: b.copy ?? '' };
    }
    setDraftBeats(next);
  }, [campaign?.id, campaign?.beats]);

  const create = useMutation({
    mutationFn: () =>
      commercialApi.createCampaign(projectId, {
        templateSlug,
        name: name.trim() || undefined,
      }),
    onSuccess: (c) => {
      setMsg(null);
      void qc.invalidateQueries({ queryKey: ['campaigns', projectId] });
      onSelectCampaign(c.id);
    },
    onError: (e: Error) => setMsg(e.message),
  });

  const patchBeat = useMutation({
    mutationFn: (beat: CampaignBeatDto) => {
      const draft = draftBeats[beat.id] ?? { prompt: '', copy: '' };
      return commercialApi.patchBeat(beat.id, {
        prompt: draft.prompt,
        copy: draft.copy,
      });
    },
    onSuccess: () => {
      setMsg(null);
      void qc.invalidateQueries({ queryKey: ['campaigns', projectId] });
    },
    onError: (e: Error) => setMsg(e.message),
  });

  const regen = useMutation({
    mutationFn: (beatId: string) => commercialApi.regenerateBeat(beatId),
    onSuccess: (r) => {
      setMsg(`Queued job ${r.job.id}`);
      void qc.invalidateQueries({ queryKey: ['campaigns', projectId] });
      void qc.invalidateQueries({ queryKey: ['jobs', projectId] });
    },
    onError: (e: Error) => setMsg(e.message),
  });

  const toggleLock = useMutation({
    mutationFn: (beat: CampaignBeatDto) =>
      commercialApi.patchBeat(beat.id, { locked: !beat.locked }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['campaigns', projectId] }),
    onError: (e: Error) => setMsg(e.message),
  });

  return (
    <div className="space-y-3">
      <Panel title="Campaign templates" subtitle="Beat grammar → timeline nodes">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 mb-3">
          {(templatesQuery.data ?? []).map((t) => (
            <button
              key={t.slug}
              type="button"
              onClick={() => setTemplateSlug(t.slug)}
              className={`rounded-md border px-2.5 py-2 text-left ${
                templateSlug === t.slug
                  ? 'border-cinema-accent bg-cinema-accent/10'
                  : 'border-cinema-border hover:bg-cinema-raised'
              }`}
            >
              <div className="text-[12px] font-semibold">{t.name}</div>
              <div className="text-[10px] text-cinema-muted mt-0.5 line-clamp-2">{t.description}</div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {(t.beats ?? []).slice(0, 4).map((b) => (
                  <Badge key={`${t.slug}-${b.type}`} tone="neutral">
                    {b.type}
                  </Badge>
                ))}
              </div>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Campaign name (optional)"
            className="flex-1 min-w-[160px] h-8 rounded-md border border-cinema-border bg-cinema-bg px-2 text-[12px]"
          />
          <Button size="sm" onClick={() => create.mutate()} disabled={create.isPending}>
            {create.isPending ? 'Creating…' : 'Create from template'}
          </Button>
        </div>
      </Panel>

      <Panel title="Campaigns">
        {(campaignsQuery.data ?? []).length === 0 ? (
          <p className="text-[12px] text-cinema-muted">No campaigns yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {(campaignsQuery.data ?? []).map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onSelectCampaign(c.id)}
                  className={`w-full flex items-center justify-between gap-2 rounded-md border px-2.5 py-2 text-left ${
                    selectedCampaignId === c.id
                      ? 'border-cinema-accent bg-cinema-accent/10'
                      : 'border-cinema-border'
                  }`}
                >
                  <span className="text-[13px] font-medium truncate">{c.name}</span>
                  <span className="text-[10px] text-cinema-muted shrink-0">
                    {(c.beats ?? []).length} beats · {c.durationSec ?? '—'}s
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {campaign && (
        <Panel title={`${campaign.name} beats`} subtitle="Edit independently · regen single beat">
          {msg && <p className="mb-2 text-[12px] text-cinema-muted">{msg}</p>}
          <div className="space-y-2">
            {beats.map((beat) => (
              <div key={beat.id} className="rounded-md border border-cinema-border p-2.5 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge tone="info">{beat.beatType}</Badge>
                    <span className="text-[12px] font-medium truncate">{beat.label}</span>
                    <span className="text-[10px] text-cinema-muted font-mono">
                      {beat.startSec}–{beat.endSec}s
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {beat.locked && <StatusChip status="locked" />}
                    <StatusChip status={beat.status === 'generating' ? 'generating' : 'draft'} label={beat.status} />
                  </div>
                </div>
                <textarea
                  value={draftBeats[beat.id]?.prompt ?? ''}
                  onChange={(e) =>
                    setDraftBeats((prev) => ({
                      ...prev,
                      [beat.id]: { prompt: e.target.value, copy: prev[beat.id]?.copy ?? '' },
                    }))
                  }
                  rows={2}
                  className="w-full rounded-md border border-cinema-border bg-cinema-bg px-2 py-1.5 text-[12px]"
                  placeholder="Prompt"
                />
                <input
                  value={draftBeats[beat.id]?.copy ?? ''}
                  onChange={(e) =>
                    setDraftBeats((prev) => ({
                      ...prev,
                      [beat.id]: { prompt: prev[beat.id]?.prompt ?? '', copy: e.target.value },
                    }))
                  }
                  className="w-full h-8 rounded-md border border-cinema-border bg-cinema-bg px-2 text-[12px]"
                  placeholder="On-screen copy"
                />
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" variant="secondary" onClick={() => patchBeat.mutate(beat)}>
                    Save
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => toggleLock.mutate(beat)}>
                    {beat.locked ? 'Unlock' : 'Lock'}
                  </Button>
                  <Button
                    size="sm"
                    disabled={beat.locked || regen.isPending}
                    onClick={() => regen.mutate(beat.id)}
                  >
                    Regenerate
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}

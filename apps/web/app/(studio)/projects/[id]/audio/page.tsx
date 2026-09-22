'use client';

import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  audioApi,
  assetsApi,
  asNumber,
  type DialogueLineDto,
  type MixBusDto,
} from '@/lib/api';
import { TimelineEditor } from '@/components/editor';

type Tab = 'dialogue' | 'adr' | 'dubbing' | 'mixer';

const PX_PER_SEC = 40;

function WaveformLane({
  label,
  startSec,
  endSec,
  duration,
}: {
  label: string;
  startSec: number;
  endSec: number;
  duration: number;
}) {
  const width = Math.max(duration, 30) * PX_PER_SEC;
  const left = startSec * PX_PER_SEC;
  const w = Math.max(8, (endSec - startSec) * PX_PER_SEC);
  const bars = Array.from({ length: Math.max(4, Math.floor(w / 3)) }, (_, i) => {
    const h = 4 + ((i * 7 + label.length * 3) % 14);
    return h;
  });

  return (
    <div className="flex items-center h-8">
      <div className="w-16 shrink-0 px-2 text-[10px] font-mono text-cinema-muted truncate">{label}</div>
      <div
        className="relative h-7 rounded-sm bg-cinema-bg/60 border border-cinema-border/50"
        style={{ width }}
      >
        <div
          className="absolute top-0.5 bottom-0.5 rounded-[2px] bg-sky-500/20 border border-sky-400/30 flex items-end gap-px px-0.5 overflow-hidden"
          style={{ left, width: w }}
        >
          {bars.map((h, i) => (
            <span
              key={i}
              className="w-[2px] bg-sky-300/70 rounded-sm"
              style={{ height: h }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function loudnessFromMeta(meta?: Record<string, unknown> | null): number | null {
  if (!meta) return null;
  const loudness = meta.loudness as Record<string, unknown> | undefined;
  const v =
    loudness?.integratedLufs ??
    meta.integratedLufs ??
    meta.loudnessLufs ??
    meta.lufs;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return Number(v) || null;
  return null;
}

function MixerStrip({
  bus,
  assets,
  onPatch,
}: {
  bus: MixBusDto;
  assets: Array<{ id: string; metadata?: Record<string, unknown> }>;
  onPatch: (id: string, body: Partial<MixBusDto>) => void;
}) {
  const asset = assets.find((a) => a.id === bus.assetId);
  const lufs = loudnessFromMeta(asset?.metadata) ?? -23 + bus.gainDb * 0.3;
  const meterH = Math.max(4, Math.min(100, ((lufs + 60) / 60) * 100));

  return (
    <div className="w-[72px] shrink-0 rounded-md border border-cinema-border bg-cinema-panel p-2 flex flex-col items-center gap-2">
      <div className="text-[10px] font-semibold text-cinema-text truncate w-full text-center">
        {bus.name}
      </div>
      <div className="h-28 w-3 rounded-sm bg-cinema-bg border border-cinema-border relative overflow-hidden">
        <div
          className="absolute bottom-0 left-0 right-0 bg-cinema-accent/70"
          style={{ height: `${meterH}%` }}
          title={`${lufs.toFixed(1)} LUFS`}
        />
      </div>
      <div className="text-[9px] font-mono text-cinema-muted">{lufs.toFixed(1)}</div>
      <label className="text-[9px] text-cinema-muted w-full">
        Gain
        <input
          type="range"
          min={-24}
          max={12}
          step={0.5}
          value={bus.gainDb}
          onChange={(e) => onPatch(bus.id, { gainDb: Number(e.target.value) })}
          className="w-full"
        />
      </label>
      <label className="text-[9px] text-cinema-muted w-full">
        Pan
        <input
          type="range"
          min={-1}
          max={1}
          step={0.05}
          value={bus.pan}
          onChange={(e) => onPatch(bus.id, { pan: Number(e.target.value) })}
          className="w-full"
        />
      </label>
      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => onPatch(bus.id, { muted: !bus.muted })}
          className={clsx(
            'text-[9px] px-1.5 py-0.5 rounded border',
            bus.muted
              ? 'border-cinema-warning text-cinema-warning'
              : 'border-cinema-border text-cinema-muted',
          )}
        >
          M
        </button>
        <button
          type="button"
          onClick={() => onPatch(bus.id, { solo: !bus.solo })}
          className={clsx(
            'text-[9px] px-1.5 py-0.5 rounded border',
            bus.solo
              ? 'border-cinema-accent text-cinema-accent'
              : 'border-cinema-border text-cinema-muted',
          )}
        >
          S
        </button>
      </div>
    </div>
  );
}

export default function AudioLabPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('dialogue');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [lang, setLang] = useState('es');

  const dialogueQ = useQuery({
    queryKey: ['audio-dialogue', projectId],
    queryFn: () => audioApi.listDialogue(projectId),
  });
  const sessionsQ = useQuery({
    queryKey: ['audio-adr', projectId],
    queryFn: () => audioApi.listAdrSessions(projectId),
  });
  const sessionQ = useQuery({
    queryKey: ['audio-adr-session', sessionId],
    queryFn: () => audioApi.getAdrSession(sessionId!),
    enabled: Boolean(sessionId),
  });
  const dubbingQ = useQuery({
    queryKey: ['audio-dubbing', projectId],
    queryFn: () => audioApi.listDubbing(projectId),
  });
  const busesQ = useQuery({
    queryKey: ['audio-buses', projectId],
    queryFn: () => audioApi.listMixBuses(projectId),
  });
  const stemsQ = useQuery({
    queryKey: ['audio-stems', projectId],
    queryFn: () => audioApi.listStems(projectId),
  });
  const assetsQ = useQuery({
    queryKey: ['assets', projectId, 'audio'],
    queryFn: () => assetsApi.list(projectId, { type: 'audio' }),
  });

  const extractMut = useMutation({
    mutationFn: () => audioApi.extractDialogue(projectId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['audio-dialogue', projectId] }),
  });
  const patchLineMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<DialogueLineDto> }) =>
      audioApi.patchDialogue(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['audio-dialogue', projectId] }),
  });
  const createSessionMut = useMutation({
    mutationFn: (line: DialogueLineDto) =>
      audioApi.createAdrSession(projectId, {
        name: `ADR · ${line.speaker ?? 'Line'} ${line.lineIndex + 1}`,
        dialogueLineId: line.id,
        loopInSec: line.startSec ?? undefined,
        loopOutSec: line.endSec ?? undefined,
      }),
    onSuccess: (s) => {
      setSessionId(s.id);
      setTab('adr');
      qc.invalidateQueries({ queryKey: ['audio-adr', projectId] });
    },
  });
  const takeMut = useMutation({
    mutationFn: () => audioApi.createAdrTake(sessionId!, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['audio-adr-session', sessionId] }),
  });
  const rateMut = useMutation({
    mutationFn: ({ id, rating }: { id: string; rating: number }) =>
      audioApi.patchAdrTake(id, { rating, selected: rating >= 4 }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['audio-adr-session', sessionId] }),
  });
  const dubMut = useMutation({
    mutationFn: () =>
      audioApi.createDubbing(projectId, {
        language: lang,
        dialogueLineId: dialogueQ.data?.[0]?.id,
        variantLabel: `${lang.toUpperCase()} dub`,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['audio-dubbing', projectId] }),
  });
  const busMut = useMutation({
    mutationFn: () => audioApi.createMixBus(projectId, { name: `Bus ${(busesQ.data?.length ?? 0) + 1}` }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['audio-buses', projectId] }),
  });
  const patchBusMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<MixBusDto> }) =>
      audioApi.patchMixBus(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['audio-buses', projectId] }),
  });
  const stemMut = useMutation({
    mutationFn: (assetId: string) => audioApi.stemSplit(projectId, { assetId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['audio-stems', projectId] }),
  });

  const lines = dialogueQ.data ?? [];
  const duration = useMemo(() => {
    const last = lines[lines.length - 1];
    return Math.max(30, asNumber(last?.endSec) + 4);
  }, [lines]);

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="border-b border-cinema-border px-4 py-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.14em] text-cinema-muted font-semibold">
            Audio Lab
          </div>
          <h1 className="text-[16px] font-semibold">Dialogue · ADR · Dubbing · Mix</h1>
        </div>
        <div className="flex gap-1 rounded-md border border-cinema-border p-0.5">
          {(
            [
              ['dialogue', 'Dialogue'],
              ['adr', 'ADR'],
              ['dubbing', 'Dubbing QC'],
              ['mixer', 'Mixer'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={clsx(
                'h-7 px-2.5 rounded text-[11px]',
                tab === id
                  ? 'bg-cinema-accent/15 text-cinema-accent'
                  : 'text-cinema-muted hover:text-cinema-text',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
        {/* Waveform-oriented audio tracks (TimelineEditor patterns) */}
        <div className="rounded-lg border border-cinema-border bg-cinema-panel overflow-hidden">
          <div className="h-7 px-3 border-b border-cinema-border flex items-center text-[11px] text-cinema-muted">
            Audio tracks
          </div>
          <div className="p-2 overflow-x-auto space-y-1">
            {lines.length === 0 ? (
              <p className="text-[12px] text-cinema-muted px-2 py-4">
                Extract dialogue to populate waveform lanes.
              </p>
            ) : (
              lines.slice(0, 12).map((line) => (
                <WaveformLane
                  key={line.id}
                  label={line.speaker ?? `L${line.lineIndex + 1}`}
                  startSec={asNumber(line.startSec)}
                  endSec={asNumber(line.endSec) || asNumber(line.startSec) + 2}
                  duration={duration}
                />
              ))
            )}
          </div>
          <TimelineEditor projectId={projectId} compact />
        </div>

        {tab === 'dialogue' && (
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-[13px] font-semibold">Dialogue editor</h2>
              <button
                type="button"
                onClick={() => extractMut.mutate()}
                disabled={extractMut.isPending}
                className="h-7 px-2.5 rounded text-[11px] border border-cinema-border hover:border-cinema-accent disabled:opacity-40"
              >
                {extractMut.isPending ? 'Extracting…' : 'Extract from script'}
              </button>
            </div>
            <div className="space-y-2">
              {lines.map((line) => (
                <div
                  key={line.id}
                  className="grid grid-cols-[88px_1fr_auto] gap-2 items-start rounded-md border border-cinema-border/70 bg-cinema-bg/40 p-2"
                >
                  <div className="text-[11px] font-mono text-cinema-muted pt-1.5">
                    {line.speaker ?? '—'}
                  </div>
                  <textarea
                    className="min-h-[44px] w-full rounded border border-cinema-border bg-cinema-panel px-2 py-1.5 text-[12.5px] outline-none focus:border-cinema-accent"
                    defaultValue={line.text}
                    onBlur={(e) => {
                      if (e.target.value !== line.text) {
                        patchLineMut.mutate({ id: line.id, body: { text: e.target.value } });
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="text-[10px] px-2 py-1 rounded border border-cinema-border hover:border-cinema-accent"
                    onClick={() => createSessionMut.mutate(line)}
                  >
                    ADR
                  </button>
                </div>
              ))}
              {lines.length === 0 && (
                <p className="text-[12px] text-cinema-muted">No dialogue lines yet.</p>
              )}
            </div>
          </section>
        )}

        {tab === 'adr' && (
          <section className="grid md:grid-cols-[220px_1fr] gap-4">
            <div className="space-y-2">
              <h2 className="text-[13px] font-semibold">Sessions</h2>
              {(sessionsQ.data ?? []).map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSessionId(s.id)}
                  className={clsx(
                    'w-full text-left rounded-md border px-2.5 py-2 text-[12px]',
                    sessionId === s.id
                      ? 'border-cinema-accent bg-cinema-accent/10 text-cinema-accent'
                      : 'border-cinema-border hover:border-cinema-border-strong',
                  )}
                >
                  {s.name}
                </button>
              ))}
              {(sessionsQ.data ?? []).length === 0 && (
                <p className="text-[11px] text-cinema-muted">
                  Open ADR from a dialogue line to start a loop session.
                </p>
              )}
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-[13px] font-semibold">
                  {sessionQ.data?.name ?? 'Select a session'}
                </h2>
                {sessionId && (
                  <button
                    type="button"
                    onClick={() => takeMut.mutate()}
                    className="h-7 px-2.5 rounded text-[11px] border border-cinema-border hover:border-cinema-accent"
                  >
                    Record take
                  </button>
                )}
              </div>
              {sessionQ.data && (
                <div className="text-[11px] text-cinema-muted font-mono">
                  Loop {asNumber(sessionQ.data.loopInSec).toFixed(1)}s →{' '}
                  {asNumber(sessionQ.data.loopOutSec).toFixed(1)}s
                </div>
              )}
              <ul className="space-y-2">
                {(sessionQ.data?.takes ?? []).map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center justify-between rounded-md border border-cinema-border px-3 py-2"
                  >
                    <span className="text-[12px]">
                      Take {t.number}
                      {t.selected ? ' · selected' : ''}
                    </span>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((r) => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => rateMut.mutate({ id: t.id, rating: r })}
                          className={clsx(
                            'h-6 w-6 rounded text-[10px] border',
                            (t.rating ?? 0) >= r
                              ? 'border-cinema-accent bg-cinema-accent/20 text-cinema-accent'
                              : 'border-cinema-border text-cinema-muted',
                          )}
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {tab === 'dubbing' && (
          <section className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[13px] font-semibold mr-auto">Dubbing QC</h2>
              <select
                value={lang}
                onChange={(e) => setLang(e.target.value)}
                className="h-7 rounded border border-cinema-border bg-cinema-bg text-[11px] px-2"
              >
                {['es', 'fr', 'de', 'hi', 'ja', 'pt'].map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => dubMut.mutate()}
                className="h-7 px-2.5 rounded text-[11px] border border-cinema-border hover:border-cinema-accent"
              >
                Add language variant
              </button>
            </div>
            <div className="overflow-x-auto rounded-md border border-cinema-border">
              <table className="w-full text-[12px]">
                <thead className="text-[10px] uppercase tracking-wider text-cinema-muted border-b border-cinema-border">
                  <tr>
                    <th className="text-left px-3 py-2">Language</th>
                    <th className="text-left px-3 py-2">Variant</th>
                    <th className="text-left px-3 py-2">Lip-sync drift</th>
                    <th className="text-left px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(dubbingQ.data ?? []).map((d) => (
                    <tr key={d.id} className="border-b border-cinema-border/50">
                      <td className="px-3 py-2 font-mono">{d.language}</td>
                      <td className="px-3 py-2">{d.variantLabel ?? '—'}</td>
                      <td className="px-3 py-2 font-mono">
                        <span
                          className={clsx(
                            Math.abs(asNumber(d.lipSyncDriftMs)) > 40
                              ? 'text-cinema-warning'
                              : 'text-cinema-accent',
                          )}
                        >
                          {asNumber(d.lipSyncDriftMs).toFixed(1)} ms
                        </span>
                        <span className="text-cinema-muted ml-1">(placeholder)</span>
                      </td>
                      <td className="px-3 py-2">{d.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {(dubbingQ.data ?? []).length === 0 && (
                <p className="px-3 py-6 text-[12px] text-cinema-muted">No dubbing tracks yet.</p>
              )}
            </div>
          </section>
        )}

        {tab === 'mixer' && (
          <section className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[13px] font-semibold mr-auto">Mixer strip</h2>
              <button
                type="button"
                onClick={() => busMut.mutate()}
                className="h-7 px-2.5 rounded text-[11px] border border-cinema-border hover:border-cinema-accent"
              >
                Add bus
              </button>
              {(assetsQ.data ?? [])[0] && (
                <button
                  type="button"
                  onClick={() => stemMut.mutate((assetsQ.data ?? [])[0]!.id)}
                  disabled={stemMut.isPending}
                  className="h-7 px-2.5 rounded text-[11px] border border-cinema-border hover:border-cinema-accent disabled:opacity-40"
                >
                  Stem split
                </button>
              )}
            </div>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {(busesQ.data ?? []).map((bus) => (
                <MixerStrip
                  key={bus.id}
                  bus={bus}
                  assets={assetsQ.data ?? []}
                  onPatch={(id, body) => patchBusMut.mutate({ id, body })}
                />
              ))}
              {(busesQ.data ?? []).length === 0 && (
                <p className="text-[12px] text-cinema-muted py-6">No mix buses yet.</p>
              )}
            </div>
            {(stemsQ.data ?? []).length > 0 && (
              <div className="text-[11px] text-cinema-muted">
                Stems: {(stemsQ.data ?? []).map((s) => s.stemType).join(' · ')}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

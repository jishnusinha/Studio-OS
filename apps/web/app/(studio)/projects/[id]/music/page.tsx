'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  musicApi,
  timelinesApi,
  asNumber,
  type MidiEventDto,
  type MusicStemDto,
} from '@/lib/api';
import { MonitorFromTimeline, formatTc } from '@/components/editor';
import { useStudioStore } from '@/lib/store';

const NOTE_MIN = 48; // C3
const NOTE_MAX = 84; // C6
const NOTE_H = 10;
const PX_PER_SEC = 64;

function noteLabel(n: number): string {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  return `${names[n % 12]}${Math.floor(n / 12) - 1}`;
}

function PianoRoll({
  events,
  duration,
  onAdd,
}: {
  events: MidiEventDto[];
  duration: number;
  onAdd: (timeSec: number, note: number) => void;
}) {
  const notes = useMemo(() => {
    const arr: number[] = [];
    for (let n = NOTE_MAX; n >= NOTE_MIN; n--) arr.push(n);
    return arr;
  }, []);
  const width = Math.max(duration, 4) * PX_PER_SEC;
  const height = notes.length * NOTE_H;

  return (
    <div className="overflow-auto rounded-md border border-cinema-border bg-[#0d1014] max-h-[320px]">
      <div className="flex" style={{ minWidth: width + 40 }}>
        <div className="sticky left-0 z-10 bg-cinema-panel border-r border-cinema-border" style={{ width: 40 }}>
          {notes.map((n) => (
            <div
              key={n}
              className={clsx(
                'text-[8px] font-mono px-1 flex items-center',
                n % 12 === 0 ? 'text-cinema-text' : 'text-cinema-muted',
                [1, 3, 6, 8, 10].includes(n % 12) && 'bg-cinema-bg/80',
              )}
              style={{ height: NOTE_H }}
            >
              {n % 12 === 0 ? noteLabel(n) : ''}
            </div>
          ))}
        </div>
        <div
          className="relative"
          style={{ width, height }}
          onClick={(e) => {
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const timeSec = x / PX_PER_SEC;
            const noteIdx = Math.floor(y / NOTE_H);
            const note = notes[noteIdx];
            if (note != null) onAdd(Math.max(0, timeSec), note);
          }}
        >
          {/* Grid */}
          {notes.map((n, i) => (
            <div
              key={n}
              className={clsx(
                'absolute left-0 right-0 border-b border-cinema-border/30',
                [1, 3, 6, 8, 10].includes(n % 12) && 'bg-white/[0.02]',
              )}
              style={{ top: i * NOTE_H, height: NOTE_H }}
            />
          ))}
          {Array.from({ length: Math.ceil(duration) + 1 }, (_, beat) => (
            <div
              key={beat}
              className="absolute top-0 bottom-0 w-px bg-cinema-border/40"
              style={{ left: beat * PX_PER_SEC }}
            />
          ))}
          {events.map((ev) => {
            const top = (NOTE_MAX - ev.note) * NOTE_H;
            if (ev.note < NOTE_MIN || ev.note > NOTE_MAX) return null;
            return (
              <div
                key={ev.id}
                className="absolute rounded-[2px] bg-cinema-accent/70 border border-cinema-accent pointer-events-none"
                style={{
                  left: ev.timeSec * PX_PER_SEC,
                  top: top + 1,
                  width: Math.max(6, ev.durationSec * PX_PER_SEC),
                  height: NOTE_H - 2,
                }}
                title={`${noteLabel(ev.note)} @ ${ev.timeSec.toFixed(2)}s`}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function StemLane({
  stem,
  onPatch,
}: {
  stem: MusicStemDto;
  onPatch: (id: string, body: Partial<MusicStemDto>) => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-cinema-border px-2 py-1.5">
      <div className="w-28 text-[12px] truncate">{stem.name}</div>
      <div className="flex-1 h-6 rounded-sm bg-cinema-bg/60 border border-cinema-border/50 relative overflow-hidden">
        <div
          className="absolute inset-y-0.5 left-1 right-1 rounded-[2px] bg-emerald-500/20 border border-emerald-400/25"
          style={{ opacity: stem.muted ? 0.25 : 1 }}
        />
      </div>
      <button
        type="button"
        onClick={() => onPatch(stem.id, { muted: !stem.muted })}
        className={clsx(
          'text-[9px] px-1.5 py-0.5 rounded border',
          stem.muted
            ? 'border-cinema-warning text-cinema-warning'
            : 'border-cinema-border text-cinema-muted',
        )}
      >
        M
      </button>
      <button
        type="button"
        onClick={() => onPatch(stem.id, { solo: !stem.solo })}
        className={clsx(
          'text-[9px] px-1.5 py-0.5 rounded border',
          stem.solo
            ? 'border-cinema-accent text-cinema-accent'
            : 'border-cinema-border text-cinema-muted',
        )}
      >
        S
      </button>
    </div>
  );
}

export default function MusicStudioPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const qc = useQueryClient();
  const timeline = useStudioStore((s) => s.activeTimeline);
  const playhead = useStudioStore((s) => s.timelinePlayhead);
  const [clipId, setClipId] = useState<string | null>(null);
  const [cueName, setCueName] = useState('Hit');

  const clipsQ = useQuery({
    queryKey: ['music-clips', projectId],
    queryFn: () => musicApi.listMidiClips(projectId),
  });
  const clipQ = useQuery({
    queryKey: ['music-clip', clipId],
    queryFn: () => musicApi.getMidiClip(clipId!),
    enabled: Boolean(clipId),
  });
  const stemsQ = useQuery({
    queryKey: ['music-stems', projectId],
    queryFn: () => musicApi.listStems(projectId),
  });
  const tempoQ = useQuery({
    queryKey: ['music-tempo', projectId],
    queryFn: () => musicApi.listTempoMaps(projectId),
  });
  const cuesQ = useQuery({
    queryKey: ['music-cues', projectId],
    queryFn: () => musicApi.listScoreCues(projectId),
  });
  const markersQ = useQuery({
    queryKey: ['music-markers', projectId],
    queryFn: () => musicApi.listScoreMarkers(projectId, timeline?.id),
    enabled: Boolean(timeline?.id),
  });
  const timelinesQ = useQuery({
    queryKey: ['timelines', projectId],
    queryFn: () => timelinesApi.list(projectId),
  });

  const genMut = useMutation({
    mutationFn: () => musicApi.generateMidi(projectId, { prompt: 'Sparse piano motif in C.' }),
    onSuccess: (res) => {
      setClipId(res.clip.id);
      qc.invalidateQueries({ queryKey: ['music-clips', projectId] });
    },
  });
  const addNoteMut = useMutation({
    mutationFn: ({ timeSec, note }: { timeSec: number; note: number }) =>
      musicApi.addMidiEvent(clipId!, { timeSec, note, durationSec: 0.25, velocity: 90 }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['music-clip', clipId] }),
  });
  const stemCreateMut = useMutation({
    mutationFn: () =>
      musicApi.createStem(projectId, {
        name: `Stem ${(stemsQ.data?.length ?? 0) + 1}`,
        stemType: 'mix',
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['music-stems', projectId] }),
  });
  const stemPatchMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<MusicStemDto> }) =>
      musicApi.patchStem(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['music-stems', projectId] }),
  });
  const tempoCreateMut = useMutation({
    mutationFn: () => musicApi.createTempoMap(projectId, { bpm: 120, timeSignature: '4/4' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['music-tempo', projectId] }),
  });
  const tempoPatchMut = useMutation({
    mutationFn: ({ id, bpm }: { id: string; bpm: number }) => musicApi.patchTempoMap(id, { bpm }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['music-tempo', projectId] }),
  });
  const cueMut = useMutation({
    mutationFn: () =>
      musicApi.createScoreCue(projectId, {
        name: cueName || 'Cue',
        timeSec: playhead || 0,
        cueType: 'hit',
        description: `Spotted at ${formatTc(playhead || 0, timeline?.fps ?? 24)}`,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['music-cues', projectId] }),
  });
  const promoteMut = useMutation({
    mutationFn: () => {
      const tlId =
        timeline?.id ??
        (timelinesQ.data as Array<{ id: string }> | undefined)?.[0]?.id;
      if (!tlId) throw new Error('No timeline');
      return musicApi.promoteMarkers(projectId, tlId);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['music-markers', projectId] }),
  });

  useEffect(() => {
    if (!clipId && clipsQ.data?.[0]) setClipId(clipsQ.data[0].id);
  }, [clipId, clipsQ.data]);

  const tempo = tempoQ.data?.[0];
  const events = clipQ.data?.events ?? [];
  const duration = clipQ.data?.durationSec ?? 4;

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="border-b border-cinema-border px-4 py-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.14em] text-cinema-muted font-semibold">
            Music Studio
          </div>
          <h1 className="text-[16px] font-semibold">Piano roll · Stems · Tempo · Score-to-picture</h1>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => genMut.mutate()}
            disabled={genMut.isPending}
            className="h-7 px-2.5 rounded text-[11px] border border-cinema-border hover:border-cinema-accent disabled:opacity-40"
          >
            {genMut.isPending ? 'Generating…' : 'Generate MIDI'}
          </button>
          <button
            type="button"
            onClick={() => stemCreateMut.mutate()}
            className="h-7 px-2.5 rounded text-[11px] border border-cinema-border hover:border-cinema-accent"
          >
            Add stem
          </button>
          {!tempo && (
            <button
              type="button"
              onClick={() => tempoCreateMut.mutate()}
              className="h-7 px-2.5 rounded text-[11px] border border-cinema-border hover:border-cinema-accent"
            >
              Create tempo map
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4 grid lg:grid-cols-[1fr_320px] gap-4">
        <div className="space-y-4 min-w-0">
          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <h2 className="text-[13px] font-semibold">Piano roll</h2>
              <select
                value={clipId ?? ''}
                onChange={(e) => setClipId(e.target.value || null)}
                className="h-7 rounded border border-cinema-border bg-cinema-bg text-[11px] px-2"
              >
                <option value="">Select clip…</option>
                {(clipsQ.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {tempo && (
                <label className="flex items-center gap-1.5 text-[11px] text-cinema-muted ml-auto">
                  BPM
                  <input
                    type="number"
                    min={40}
                    max={240}
                    value={tempo.bpm}
                    onChange={(e) =>
                      tempoPatchMut.mutate({ id: tempo.id, bpm: Number(e.target.value) || 120 })
                    }
                    className="w-16 h-7 rounded border border-cinema-border bg-cinema-bg px-1.5 font-mono"
                  />
                  <span className="font-mono">{tempo.timeSignature}</span>
                </label>
              )}
            </div>
            {clipId ? (
              <PianoRoll
                events={events}
                duration={duration}
                onAdd={(timeSec, note) => addNoteMut.mutate({ timeSec, note })}
              />
            ) : (
              <p className="text-[12px] text-cinema-muted py-8 text-center border border-dashed border-cinema-border rounded-md">
                Generate or select a MIDI clip to edit the piano roll.
              </p>
            )}
          </section>

          <section className="space-y-2">
            <h2 className="text-[13px] font-semibold">Stem lanes</h2>
            <div className="space-y-1.5">
              {(stemsQ.data ?? []).map((s) => (
                <StemLane
                  key={s.id}
                  stem={s}
                  onPatch={(id, body) => stemPatchMut.mutate({ id, body })}
                />
              ))}
              {(stemsQ.data ?? []).length === 0 && (
                <p className="text-[12px] text-cinema-muted">No music stems yet.</p>
              )}
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <section className="rounded-lg border border-cinema-border bg-cinema-panel p-3 space-y-2">
            <h2 className="text-[12px] font-semibold uppercase tracking-wider text-cinema-muted">
              Program monitor
            </h2>
            <MonitorFromTimeline timeline={timeline} playhead={playhead} />
            <div className="text-[11px] font-mono text-cinema-muted">
              Playhead {formatTc(playhead || 0, timeline?.fps ?? 24)}
            </div>
          </section>

          <section className="rounded-lg border border-cinema-border bg-cinema-panel p-3 space-y-2">
            <h2 className="text-[12px] font-semibold uppercase tracking-wider text-cinema-muted">
              Score-to-picture cues
            </h2>
            <div className="flex gap-1.5">
              <input
                value={cueName}
                onChange={(e) => setCueName(e.target.value)}
                placeholder="Cue name"
                className="flex-1 h-7 rounded border border-cinema-border bg-cinema-bg px-2 text-[12px]"
              />
              <button
                type="button"
                onClick={() => cueMut.mutate()}
                className="h-7 px-2 rounded text-[11px] border border-cinema-border hover:border-cinema-accent"
              >
                Spot
              </button>
            </div>
            <ul className="space-y-1 max-h-40 overflow-y-auto">
              {(cuesQ.data ?? []).map((c) => (
                <li
                  key={c.id}
                  className="flex justify-between text-[11px] border-b border-cinema-border/50 py-1"
                >
                  <span>{c.name}</span>
                  <span className="font-mono text-cinema-muted">
                    {asNumber(c.timeSec).toFixed(2)}s
                  </span>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => promoteMut.mutate()}
              disabled={promoteMut.isPending}
              className="w-full h-7 rounded text-[11px] border border-cinema-border hover:border-cinema-accent disabled:opacity-40"
            >
              Promote timeline markers
            </button>
            {(markersQ.data ?? []).length > 0 && (
              <div className="text-[10px] text-cinema-muted">
                {markersQ.data!.length} score marker(s) promoted
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

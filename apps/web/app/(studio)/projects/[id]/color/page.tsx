'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  colorApi,
  timelinesApi,
  type ClipColorStateDto,
  type ColorScopeAnalyzeDto,
  type ColorWheelDto,
  type TimelineDto,
} from '@/lib/api';

const DEFAULT_WHEEL: ColorWheelDto = { r: 0, g: 0, b: 0 };
const DEFAULT_GAMMA: ColorWheelDto = { r: 1, g: 1, b: 1 };
const DEFAULT_GAIN: ColorWheelDto = { r: 1, g: 1, b: 1 };
const DEFAULT_CURVE: Array<[number, number]> = [
  [0, 0],
  [0.5, 0.5],
  [1, 1],
];
const DEFAULT_QUALIFIERS = {
  hue: [0, 360] as [number, number],
  saturation: [0, 1] as [number, number],
  luminance: [0, 1] as [number, number],
};

function WheelControl({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: ColorWheelDto;
  min: number;
  max: number;
  step: number;
  onChange: (next: ColorWheelDto) => void;
}) {
  return (
    <div className="rounded-md border border-cinema-border bg-cinema-panel/60 p-3 space-y-2">
      <div className="text-[11px] uppercase tracking-wide text-cinema-muted">{label}</div>
      <div
        className="relative mx-auto h-24 w-24 rounded-full border border-cinema-border"
        style={{
          background: `radial-gradient(circle at 50% 50%, rgba(${Math.round(
            ((value.r - min) / (max - min)) * 255,
          )},${Math.round(((value.g - min) / (max - min)) * 255)},${Math.round(
            ((value.b - min) / (max - min)) * 255,
          )},0.85), #111)`,
        }}
      />
      {(['r', 'g', 'b'] as const).map((ch) => (
        <label key={ch} className="flex items-center gap-2 text-[11px] font-mono">
          <span className="w-3 uppercase text-cinema-muted">{ch}</span>
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={value[ch]}
            onChange={(e) => onChange({ ...value, [ch]: Number(e.target.value) })}
            className="flex-1 accent-cinema-accent"
          />
          <span className="w-10 text-right text-cinema-text">{value[ch].toFixed(2)}</span>
        </label>
      ))}
    </div>
  );
}

function CurvesSvg({
  points,
  onChange,
}: {
  points: Array<[number, number]>;
  onChange: (pts: Array<[number, number]>) => void;
}) {
  const w = 220;
  const h = 140;
  const pad = 8;
  const toX = (t: number) => pad + t * (w - pad * 2);
  const toY = (v: number) => h - pad - v * (h - pad * 2);
  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(p[0])} ${toY(p[1])}`)
    .join(' ');

  return (
    <svg
      width={w}
      height={h}
      className="rounded-md border border-cinema-border bg-[#0d1014] w-full"
      onClick={(e) => {
        const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
        const x = (e.clientX - rect.left - pad) / (w - pad * 2);
        const y = 1 - (e.clientY - rect.top - pad) / (h - pad * 2);
        const nx = Math.min(1, Math.max(0, x));
        const ny = Math.min(1, Math.max(0, y));
        const next = [...points, [nx, ny] as [number, number]].sort((a, b) => a[0] - b[0]);
        onChange(next);
      }}
    >
      <line x1={pad} y1={h - pad} x2={w - pad} y2={pad} stroke="#333" strokeWidth={1} />
      <path d={path} fill="none" stroke="#6ee7b7" strokeWidth={2} />
      {points.map((p, i) => (
        <circle
          key={i}
          cx={toX(p[0])}
          cy={toY(p[1])}
          r={4}
          fill="#6ee7b7"
          className="cursor-pointer"
          onClick={(ev) => {
            ev.stopPropagation();
            if (points.length <= 2) return;
            onChange(points.filter((_, j) => j !== i));
          }}
        />
      ))}
    </svg>
  );
}

function ScopePanel({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-md border border-cinema-border bg-cinema-panel/50 p-2 space-y-1.5">
      <div className="text-[10px] uppercase tracking-wide text-cinema-muted">{title}</div>
      {children}
    </div>
  );
}

function WaveformScope({ values }: { values: number[] }) {
  const w = 200;
  const h = 80;
  const pts = values
    .map((v, i) => {
      const x = (i / Math.max(1, values.length - 1)) * w;
      const y = h - v * h;
      return `${x},${y}`;
    })
    .join(' ');
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} className="h-20 bg-[#0a0c10] rounded">
      <polyline points={pts} fill="none" stroke="#94a3b8" strokeWidth={1.5} />
    </svg>
  );
}

function VectorscopeScope({
  points,
}: {
  points: Array<{ u: number; v: number; w: number }>;
}) {
  const size = 100;
  const cx = size / 2;
  const cy = size / 2;
  return (
    <svg width="100%" viewBox={`0 0 ${size} ${size}`} className="h-24 bg-[#0a0c10] rounded">
      <circle cx={cx} cy={cy} r={size * 0.42} fill="none" stroke="#333" />
      <line x1={cx} y1={8} x2={cx} y2={size - 8} stroke="#222" />
      <line x1={8} y1={cy} x2={size - 8} y2={cy} stroke="#222" />
      {points.map((p, i) => (
        <circle
          key={i}
          cx={cx + p.u * 40}
          cy={cy - p.v * 40}
          r={1.5 + p.w}
          fill={`hsla(${(i * 17) % 360},70%,60%,0.8)`}
        />
      ))}
    </svg>
  );
}

function HistogramScope({
  channels,
}: {
  channels: { r: number[]; g: number[]; b: number[]; y: number[] };
}) {
  const max = Math.max(...channels.y, 0.01);
  return (
    <div className="h-20 flex items-end gap-px bg-[#0a0c10] rounded px-1 py-1">
      {channels.y.map((v, i) => (
        <div
          key={i}
          className="flex-1 rounded-sm bg-slate-400/70"
          style={{ height: `${(v / max) * 100}%` }}
        />
      ))}
    </div>
  );
}

function firstVideoClip(timeline?: TimelineDto | null) {
  if (!timeline) return null;
  for (const track of timeline.tracks) {
    if (track.type !== 'video' && track.type !== 'V') continue;
    if (track.clips[0]) return { track, clip: track.clips[0] };
  }
  for (const track of timeline.tracks) {
    if (track.clips[0]) return { track, clip: track.clips[0] };
  }
  return null;
}

function gradeFromState(state: {
  lift: ColorWheelDto;
  gamma: ColorWheelDto;
  gain: ColorWheelDto;
  curves: Record<string, Array<[number, number]>>;
  qualifiers: typeof DEFAULT_QUALIFIERS;
}) {
  const master = state.curves.master ?? DEFAULT_CURVE;
  const curveStr = master.map(([x, y]) => `${x.toFixed(3)}/${y.toFixed(3)}`).join(' ');
  return {
    lift: state.lift,
    gammaWheel: state.gamma,
    gain: state.gain,
    rs: state.lift.r,
    gs: state.lift.g,
    bs: state.lift.b,
    rm: state.gamma.r - 1,
    gm: state.gamma.g - 1,
    bm: state.gamma.b - 1,
    rh: state.gain.r - 1,
    gh: state.gain.g - 1,
    bh: state.gain.b - 1,
    brightness: (state.lift.r + state.lift.g + state.lift.b) / 3,
    contrast: (state.gain.r + state.gain.g + state.gain.b) / 3,
    gamma: (state.gamma.r + state.gamma.g + state.gamma.b) / 3,
    curves: { master: curveStr },
    qualifiers: state.qualifiers,
  };
}

export default function ColorPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const qc = useQueryClient();

  const timelinesQuery = useQuery({
    queryKey: ['timelines', projectId],
    queryFn: () => timelinesApi.list(projectId) as Promise<Array<{ id: string; name: string }>>,
  });
  const [timelineId, setTimelineId] = useState<string>('');
  useEffect(() => {
    if (!timelineId && timelinesQuery.data?.[0]?.id) {
      setTimelineId(timelinesQuery.data[0].id);
    }
  }, [timelineId, timelinesQuery.data]);

  const timelineQuery = useQuery({
    queryKey: ['timeline', timelineId],
    queryFn: () => timelinesApi.get(timelineId),
    enabled: !!timelineId,
  });
  const timeline = timelineQuery.data?.timeline as TimelineDto | undefined;
  const selected = useMemo(() => firstVideoClip(timeline), [timeline]);
  const clipId = selected?.clip.id;

  const gradesQuery = useQuery({
    queryKey: ['color-grades', projectId],
    queryFn: () => colorApi.listGrades(projectId),
  });

  const [lift, setLift] = useState(DEFAULT_WHEEL);
  const [gamma, setGamma] = useState(DEFAULT_GAMMA);
  const [gain, setGain] = useState(DEFAULT_GAIN);
  const [curvePts, setCurvePts] = useState(DEFAULT_CURVE);
  const [qualifiers, setQualifiers] = useState(DEFAULT_QUALIFIERS);
  const [scopes, setScopes] = useState<ColorScopeAnalyzeDto['scopes'] | null>(null);
  const [hydratedClip, setHydratedClip] = useState<string | null>(null);

  useEffect(() => {
    if (!clipId || !projectId || hydratedClip === clipId) return;
    void colorApi.listClipStates(projectId, timelineId || undefined).then((rows) => {
      const row = rows.find((r) => r.clipId === clipId) as ClipColorStateDto | undefined;
      if (row) {
        setLift(row.lift ?? DEFAULT_WHEEL);
        setGamma(row.gamma ?? DEFAULT_GAMMA);
        setGain(row.gain ?? DEFAULT_GAIN);
        setCurvePts(row.curves?.master ?? DEFAULT_CURVE);
        setQualifiers(row.qualifiers ?? DEFAULT_QUALIFIERS);
      } else {
        setLift(DEFAULT_WHEEL);
        setGamma(DEFAULT_GAMMA);
        setGain(DEFAULT_GAIN);
        setCurvePts(DEFAULT_CURVE);
        setQualifiers(DEFAULT_QUALIFIERS);
      }
      setHydratedClip(clipId);
    });
  }, [clipId, projectId, timelineId, hydratedClip]);

  const applyMutation = useMutation({
    mutationFn: async () => {
      if (!timelineId || !clipId) throw new Error('Select a timeline clip first');
      const grade = gradeFromState({
        lift,
        gamma,
        gain,
        curves: { master: curvePts },
        qualifiers,
      });
      await colorApi.upsertClipState(projectId, {
        timelineId,
        clipId,
        lift,
        gamma,
        gain,
        curves: { master: curvePts },
        qualifiers,
      });
      return timelinesApi.command(timelineId, {
        id: crypto.randomUUID(),
        type: 'set_color_grade',
        timestamp: Date.now(),
        source: 'user',
        payload: { clipId, grade },
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['timeline', timelineId] });
    },
  });

  const analyzeMutation = useMutation({
    mutationFn: () =>
      colorApi.analyzeScopes(projectId, {
        timelineId: timelineId || undefined,
        clipId,
        assetId: selected?.clip.assetId,
      }),
    onSuccess: (data) => setScopes(data.scopes),
  });

  const createGradeMutation = useMutation({
    mutationFn: () => colorApi.createGrade(projectId, { name: `Grade ${(gradesQuery.data?.length ?? 0) + 1}` }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['color-grades', projectId] }),
  });

  return (
    <div className="h-full overflow-auto p-4 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-medium text-cinema-text">Color</h1>
          <p className="text-[12px] text-cinema-muted">
            Lift / gamma / gain wheels, curves, HSL qualifiers — writes clip.effects color_grade.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="rounded-md border border-cinema-border bg-cinema-bg px-2 py-1.5 text-[12px]"
            value={timelineId}
            onChange={(e) => {
              setTimelineId(e.target.value);
              setHydratedClip(null);
            }}
          >
            {(timelinesQuery.data ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="rounded-md border border-cinema-border px-2.5 py-1.5 text-[12px] hover:border-cinema-accent/50"
            onClick={() => analyzeMutation.mutate()}
            disabled={analyzeMutation.isPending}
          >
            Refresh scopes
          </button>
          <button
            type="button"
            className="rounded-md bg-cinema-accent/90 px-2.5 py-1.5 text-[12px] text-black font-medium disabled:opacity-40"
            onClick={() => applyMutation.mutate()}
            disabled={!clipId || applyMutation.isPending}
          >
            Apply grade
          </button>
        </div>
      </div>

      <div className="text-[12px] text-cinema-muted font-mono">
        Clip:{' '}
        <span className="text-cinema-text">
          {selected?.clip.label || selected?.clip.id?.slice(0, 8) || 'none'}
        </span>
        {applyMutation.isError && (
          <span className="ml-3 text-rose-400">{(applyMutation.error as Error).message}</span>
        )}
        {applyMutation.isSuccess && <span className="ml-3 text-emerald-400">Grade applied</span>}
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_280px]">
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <WheelControl label="Lift" value={lift} min={-0.5} max={0.5} step={0.01} onChange={setLift} />
            <WheelControl label="Gamma" value={gamma} min={0.2} max={2} step={0.01} onChange={setGamma} />
            <WheelControl label="Gain" value={gain} min={0.2} max={2} step={0.01} onChange={setGain} />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-md border border-cinema-border bg-cinema-panel/60 p-3 space-y-2">
              <div className="text-[11px] uppercase tracking-wide text-cinema-muted">Curves</div>
              <CurvesSvg points={curvePts} onChange={setCurvePts} />
              <button
                type="button"
                className="text-[11px] text-cinema-muted hover:text-cinema-text"
                onClick={() => setCurvePts(DEFAULT_CURVE)}
              >
                Reset curve
              </button>
            </div>

            <div className="rounded-md border border-cinema-border bg-cinema-panel/60 p-3 space-y-3">
              <div className="text-[11px] uppercase tracking-wide text-cinema-muted">HSL qualifiers</div>
              {(
                [
                  ['hue', 0, 360, 1],
                  ['saturation', 0, 1, 0.01],
                  ['luminance', 0, 1, 0.01],
                ] as const
              ).map(([key, min, max, step]) => (
                <div key={key} className="space-y-1">
                  <div className="flex justify-between text-[11px] font-mono text-cinema-muted">
                    <span className="capitalize">{key}</span>
                    <span>
                      {qualifiers[key][0].toFixed(key === 'hue' ? 0 : 2)} –{' '}
                      {qualifiers[key][1].toFixed(key === 'hue' ? 0 : 2)}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="range"
                      min={min}
                      max={max}
                      step={step}
                      value={qualifiers[key][0]}
                      onChange={(e) =>
                        setQualifiers({
                          ...qualifiers,
                          [key]: [Number(e.target.value), qualifiers[key][1]],
                        })
                      }
                      className="flex-1 accent-cinema-accent"
                    />
                    <input
                      type="range"
                      min={min}
                      max={max}
                      step={step}
                      value={qualifiers[key][1]}
                      onChange={(e) =>
                        setQualifiers({
                          ...qualifiers,
                          [key]: [qualifiers[key][0], Number(e.target.value)],
                        })
                      }
                      className="flex-1 accent-cinema-accent"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <ScopePanel title="Waveform">
              {scopes ? (
                <WaveformScope values={scopes.waveform.luma} />
              ) : (
                <div className="h-20 grid place-items-center text-[11px] text-cinema-muted">
                  Run refresh scopes
                </div>
              )}
            </ScopePanel>
            <ScopePanel title="Vectorscope">
              {scopes ? (
                <VectorscopeScope points={scopes.vectorscope.points} />
              ) : (
                <div className="h-24 grid place-items-center text-[11px] text-cinema-muted">—</div>
              )}
            </ScopePanel>
            <ScopePanel title="Histogram">
              {scopes ? (
                <HistogramScope channels={scopes.histogram} />
              ) : (
                <div className="h-20 grid place-items-center text-[11px] text-cinema-muted">—</div>
              )}
            </ScopePanel>
          </div>
          {scopes?.proxy && (
            <div className="text-[10px] font-mono text-cinema-muted">
              Proxy sample {scopes.proxy.width}×{scopes.proxy.height}
              {scopes.proxy.fps != null ? ` @ ${scopes.proxy.fps}fps` : ''}
              {scopes.proxy.assetId ? ` · ${scopes.proxy.assetId.slice(0, 8)}` : ''}
            </div>
          )}
        </div>

        <aside className="space-y-3">
          <div className="rounded-md border border-cinema-border bg-cinema-panel/60 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-[11px] uppercase tracking-wide text-cinema-muted">Grades</div>
              <button
                type="button"
                className="text-[11px] text-cinema-accent"
                onClick={() => createGradeMutation.mutate()}
              >
                + New
              </button>
            </div>
            <ul className="space-y-1 max-h-48 overflow-auto">
              {(gradesQuery.data ?? []).map((g) => (
                <li
                  key={g.id}
                  className={clsx(
                    'rounded px-2 py-1.5 text-[12px] border border-transparent',
                    'hover:border-cinema-border',
                  )}
                >
                  <div className="text-cinema-text">{g.name}</div>
                  <div className="text-[10px] font-mono text-cinema-muted">v{g.version}</div>
                </li>
              ))}
              {!gradesQuery.data?.length && (
                <li className="text-[11px] text-cinema-muted">No saved grades yet</li>
              )}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}

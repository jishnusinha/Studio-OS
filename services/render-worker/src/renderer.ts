import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';
import { platform } from 'node:os';
import { promisify } from 'node:util';
import type { Clip, Effect, Timeline, Track, Transform } from '@studio-os/contracts';
import { toEdl } from '@studio-os/timeline';

const execFileAsync = promisify(execFile);

/** Aspect × duration presets for delivery. */
export type RenderPreset =
  | 'master'
  | '16:9'
  | '9:16'
  | '1:1'
  | '4:5'
  | '2.39:1'
  | '6s'
  | '15s'
  | '30s'
  | '60s'
  | `${'16:9' | '9:16' | '1:1' | '4:5' | '2.39:1'}_${'6s' | '15s' | '30s' | '60s'}`;

export interface RenderOptions {
  assetPathMap: Record<string, string>;
  outputPath: string;
  preset?: RenderPreset | string;
}

export interface PresetDims {
  width: number;
  height: number;
  maxDurationSec?: number;
}

const ASPECTS: Record<string, { width: number; height: number }> = {
  master: { width: 1920, height: 1080 },
  '16:9': { width: 1920, height: 1080 },
  '9:16': { width: 1080, height: 1920 },
  '1:1': { width: 1080, height: 1080 },
  '4:5': { width: 1080, height: 1350 },
  '2.39:1': { width: 1920, height: 804 },
};

const DURATIONS = new Set(['6s', '15s', '30s', '60s']);

function parseDurationToken(token: string): number | undefined {
  if (!DURATIONS.has(token)) return undefined;
  return Number(token.replace('s', ''));
}

export function resolvePreset(preset?: string): PresetDims {
  if (!preset) return { ...ASPECTS['16:9']! };

  // Combined form: "9:16_15s"
  if (preset.includes('_')) {
    const [aspect, dur] = preset.split('_');
    const base = ASPECTS[aspect ?? ''] ?? ASPECTS['16:9']!;
    return { ...base, maxDurationSec: parseDurationToken(dur ?? '') };
  }

  if (DURATIONS.has(preset)) {
    return { ...ASPECTS['16:9']!, maxDurationSec: parseDurationToken(preset) };
  }

  return { ...(ASPECTS[preset] ?? ASPECTS['16:9']!) };
}

/** Enumerate recommended delivery presets (aspect × duration). */
export function listDeliveryPresets(): string[] {
  const aspects = ['16:9', '9:16', '1:1', '4:5', '2.39:1'];
  const durations = ['6s', '15s', '30s', '60s'];
  const out: string[] = [...aspects];
  for (const a of aspects) {
    for (const d of durations) out.push(`${a}_${d}`);
  }
  return out;
}

let ffmpegAvailable: boolean | null = null;

async function hasFfmpeg(): Promise<boolean> {
  if (ffmpegAvailable !== null) return ffmpegAvailable;
  const cmd = platform() === 'win32' ? 'where' : 'which';
  try {
    await execFileAsync(cmd, ['ffmpeg']);
    ffmpegAvailable = true;
  } catch {
    ffmpegAvailable = false;
  }
  return ffmpegAvailable;
}

function clipDuration(clip: Clip): number {
  return Math.max(0, (clip.sourceOut - clip.sourceIn) / (clip.speed || 1));
}

function isAudioTrack(track: Track): boolean {
  return track.type === 'audio' || track.type === 'music' || track.type === 'sfx';
}

function sortedVideoTracks(timeline: Timeline): Array<{ track: Track; sortOrder: number }> {
  return timeline.tracks
    .map((track, index) => ({ track, sortOrder: index }))
    .filter(({ track }) => track.type === 'video' && !track.muted)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

function sortedAudioTracks(timeline: Timeline): Track[] {
  return timeline.tracks.filter((t) => isAudioTrack(t) && !t.muted);
}

function findClipById(timeline: Timeline, clipId: string): Clip | undefined {
  for (const track of timeline.tracks) {
    const clip = track.clips.find((c) => c.id === clipId);
    if (clip) return clip;
  }
  return undefined;
}

/**
 * Map clip.transform → ffmpeg filter chain fragment (scale / rotate / opacity / position).
 */
function transformFilters(transform: Transform, canvasW: number, canvasH: number): string[] {
  const parts: string[] = [];
  const scaleX = transform.scaleX || 1;
  const scaleY = transform.scaleY || 1;
  if (scaleX !== 1 || scaleY !== 1) {
    parts.push(`scale=iw*${scaleX}:ih*${scaleY}`);
  }
  if (transform.rotation) {
    parts.push(`rotate=${(transform.rotation * Math.PI) / 180}:fillcolor=black@0`);
  }
  // Fit onto canvas with optional xy offset via pad
  parts.push(
    `scale=${canvasW}:${canvasH}:force_original_aspect_ratio=decrease`,
    `pad=${canvasW}:${canvasH}:(ow-iw)/2+${transform.x}:(oh-ih)/2+${transform.y}:color=black@0`,
    'setsar=1',
  );
  if (transform.opacity < 1) {
    parts.push(`format=rgba,colorchannelmixer=aa=${transform.opacity}`);
  }
  return parts;
}

/**
 * Map known effect types to ffmpeg filters; unknown types are no-ops.
 * color_grade → eq / colorbalance / lut3d / curves
 */
function effectFilters(effects: Effect[]): string[] {
  const parts: string[] = [];
  for (const effect of effects) {
    if (!effect.enabled) continue;
    const p = effect.parameters ?? {};
    switch (effect.type) {
      case 'color_grade': {
        const eqBits: string[] = [];
        if (p.brightness != null) eqBits.push(`brightness=${Number(p.brightness)}`);
        if (p.contrast != null) eqBits.push(`contrast=${Number(p.contrast)}`);
        if (p.saturation != null) eqBits.push(`saturation=${Number(p.saturation)}`);
        if (p.gamma != null) eqBits.push(`gamma=${Number(p.gamma)}`);
        if (eqBits.length) parts.push(`eq=${eqBits.join(':')}`);

        const cb: string[] = [];
        if (p.rs != null) cb.push(`rs=${Number(p.rs)}`);
        if (p.gs != null) cb.push(`gs=${Number(p.gs)}`);
        if (p.bs != null) cb.push(`bs=${Number(p.bs)}`);
        if (p.rm != null) cb.push(`rm=${Number(p.rm)}`);
        if (p.gm != null) cb.push(`gm=${Number(p.gm)}`);
        if (p.bm != null) cb.push(`bm=${Number(p.bm)}`);
        if (p.rh != null) cb.push(`rh=${Number(p.rh)}`);
        if (p.gh != null) cb.push(`gh=${Number(p.gh)}`);
        if (p.bh != null) cb.push(`bh=${Number(p.bh)}`);
        if (cb.length) parts.push(`colorbalance=${cb.join(':')}`);

        if (typeof p.lut === 'string' && p.lut.trim()) {
          parts.push(`lut3d=${p.lut.trim()}`);
        }
        if (typeof p.curves === 'string' && p.curves.trim()) {
          parts.push(`curves=${p.curves.trim()}`);
        } else if (p.curves && typeof p.curves === 'object') {
          const master = (p.curves as Record<string, unknown>).master;
          if (typeof master === 'string') parts.push(`curves=${master}`);
        }
        break;
      }
      case 'mask':
      case 'multicam':
      case 'audio_gain':
        // no-op for video graph (mask/multicam need compositor; audio_gain applied on audio)
        break;
      default:
        // Unknown effect types intentionally skipped (no-op)
        break;
    }
  }
  return parts;
}

function audioGainFromClip(clip: Clip): number {
  const gain = clip.effects.find((e) => e.type === 'audio_gain' && e.enabled);
  if (gain?.parameters?.volume != null) return Number(gain.parameters.volume);
  return 1;
}

/**
 * Compile ffmpeg argv: video tracks layered by sortOrder (array index),
 * audio/music/sfx mixed with amix, transforms + color_grade effects applied,
 * linkedAudioClipId audio included in the mix.
 */
export function compileTimelineToFfmpegArgs(
  timeline: Timeline,
  assetPathMap: Record<string, string>,
  options: { width?: number; height?: number; outputPath?: string; maxDurationSec?: number } = {},
): string[] {
  const width = options.width ?? timeline.width ?? 1920;
  const height = options.height ?? timeline.height ?? 1080;
  const outputPath = options.outputPath ?? 'out.mp4';
  const totalDur = Math.max(1, options.maxDurationSec ?? (timeline.duration || 1));

  const videoTracks = sortedVideoTracks(timeline);
  const videoClips = videoTracks.flatMap(({ track, sortOrder }) =>
    [...track.clips]
      .sort((a, b) => a.timelineStart - b.timelineStart)
      .map((clip) => ({ clip, sortOrder, trackId: track.id })),
  );

  const audioTrackClips = sortedAudioTracks(timeline).flatMap((track) =>
    [...track.clips]
      .filter((c) => !c.muted)
      .sort((a, b) => a.timelineStart - b.timelineStart)
      .map((clip) => ({ clip, fromLinked: false as boolean })),
  );

  // Honour linkedAudioClipId on video clips (pull linked audio if not already in mix)
  const seenAudioIds = new Set(audioTrackClips.map(({ clip }) => clip.id));
  for (const { clip } of videoClips) {
    if (!clip.linkedAudioClipId || seenAudioIds.has(clip.linkedAudioClipId)) continue;
    const linked = findClipById(timeline, clip.linkedAudioClipId);
    if (!linked || linked.muted) continue;
    if (!assetPathMap[linked.assetId]) continue;
    audioTrackClips.push({ clip: linked, fromLinked: true });
    seenAudioIds.add(linked.id);
  }

  if (videoClips.length === 0) {
    return [
      '-y',
      '-f',
      'lavfi',
      '-i',
      `color=c=black:s=${width}x${height}:d=${totalDur}`,
      '-f',
      'lavfi',
      '-i',
      `anullsrc=r=48000:cl=stereo:d=${totalDur}`,
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-shortest',
      outputPath,
    ];
  }

  const args: string[] = ['-y'];
  const filterParts: string[] = [];
  let inputIndex = 0;

  // Base black canvas — bottom layer
  args.push('-f', 'lavfi', '-i', `color=c=black:s=${width}x${height}:d=${totalDur}`);
  const baseIdx = inputIndex++;
  filterParts.push(`[${baseIdx}:v]format=rgba[base]`);

  // Process each video clip as its own input, overlay by sortOrder then timelineStart
  const overlayLabels: string[] = [];
  const ordered = [...videoClips].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.clip.timelineStart - b.clip.timelineStart;
  });

  for (let i = 0; i < ordered.length; i++) {
    const { clip } = ordered[i]!;
    const path = assetPathMap[clip.assetId];
    if (!path) {
      throw new Error(`Missing asset path for clip ${clip.id} asset ${clip.assetId}`);
    }
    args.push('-i', path);
    const idx = inputIndex++;
    const start = clip.sourceIn;
    const end = clip.sourceOut;
    const speed = clip.speed || 1;
    const setpts = speed !== 1 ? `setpts=(PTS-STARTPTS)/${speed}` : 'setpts=PTS-STARTPTS';
    const chain = [
      `trim=start=${start}:end=${end}`,
      setpts,
      ...transformFilters(clip.transform, width, height),
      ...effectFilters(clip.effects),
      'format=rgba',
    ];
    const label = `vc${i}`;
    filterParts.push(`[${idx}:v]${chain.join(',')}[${label}]`);
    overlayLabels.push(label);
  }

  // Layer overlays: base → clip0 → clip1 … (higher sortOrder on top)
  let prev = 'base';
  for (let i = 0; i < overlayLabels.length; i++) {
    const label = overlayLabels[i]!;
    const { clip } = ordered[i]!;
    const t0 = clip.timelineStart;
    const t1 = clip.timelineStart + clipDuration(clip);
    const out = i === overlayLabels.length - 1 ? 'vout_raw' : `ov${i}`;
    filterParts.push(
      `[${prev}][${label}]overlay=x=0:y=0:enable='between(t,${t0},${t1})'[${out}]`,
    );
    prev = out;
  }

  if (options.maxDurationSec != null) {
    filterParts.push(
      `[vout_raw]trim=duration=${options.maxDurationSec},setpts=PTS-STARTPTS,format=yuv420p[vout]`,
    );
  } else {
    filterParts.push(`[vout_raw]format=yuv420p[vout]`);
  }

  // Audio mix — per-track clips + linked audio via amix
  const aLabels: string[] = [];
  for (let i = 0; i < audioTrackClips.length; i++) {
    const { clip } = audioTrackClips[i]!;
    const path = assetPathMap[clip.assetId];
    if (!path) continue;
    args.push('-i', path);
    const idx = inputIndex++;
    const label = `a${i}`;
    const delayMs = Math.round(clip.timelineStart * 1000);
    const volume = audioGainFromClip(clip);
    const volFilter = volume !== 1 ? `,volume=${volume}` : '';
    filterParts.push(
      `[${idx}:a]atrim=start=${clip.sourceIn}:end=${clip.sourceOut},asetpts=PTS-STARTPTS,adelay=${delayMs}|${delayMs}${volFilter}[${label}]`,
    );
    aLabels.push(`[${label}]`);
  }

  if (aLabels.length > 0) {
    filterParts.push(
      `${aLabels.join('')}amix=inputs=${aLabels.length}:duration=longest:dropout_transition=0[aout]`,
    );
  } else {
    args.push('-f', 'lavfi', '-i', `anullsrc=r=48000:cl=stereo:d=${totalDur}`);
    const silentIdx = inputIndex++;
    filterParts.push(`[${silentIdx}:a]anull[aout]`);
  }

  args.push(
    '-filter_complex',
    filterParts.join(';'),
    '-map',
    '[vout]',
    '-map',
    '[aout]',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-shortest',
    outputPath,
  );
  return args;
}

/** Write EDL text when ffmpeg is unavailable. */
export async function writeEdlMaster(
  timeline: Timeline,
  assetPathMap: Record<string, string>,
  outputPath: string,
  preset: PresetDims,
): Promise<string> {
  await fs.mkdir(dirname(outputPath), { recursive: true });
  const edlBody = toEdl(timeline);
  const header = [
    `* PRESET: ${preset.width}x${preset.height}${preset.maxDurationSec != null ? ` max=${preset.maxDurationSec}s` : ''}`,
    `* ASSET MAP: ${JSON.stringify(assetPathMap)}`,
    '',
  ].join('\n');

  const edlPath = outputPath.endsWith('.edl') ? outputPath : `${outputPath}.edl`;
  await fs.writeFile(edlPath, `${header}${edlBody}`, 'utf8');

  if (edlPath !== outputPath) {
    await fs.writeFile(
      outputPath,
      `StudioOS render stub (no ffmpeg)\nSee: ${edlPath}\n`,
      'utf8',
    );
  }
  return edlPath;
}

export interface RenderResult {
  outputPath: string;
  edlPath?: string;
  args: string[];
  mock: boolean;
  preset: PresetDims;
}

export async function renderTimeline(
  timeline: Timeline,
  options: RenderOptions,
): Promise<RenderResult> {
  const preset = resolvePreset(options.preset);
  const args = compileTimelineToFfmpegArgs(timeline, options.assetPathMap, {
    width: preset.width,
    height: preset.height,
    outputPath: options.outputPath,
    maxDurationSec: preset.maxDurationSec,
  });

  await fs.mkdir(dirname(options.outputPath), { recursive: true });

  if (!(await hasFfmpeg())) {
    const edlPath = await writeEdlMaster(timeline, options.assetPathMap, options.outputPath, preset);
    return { outputPath: options.outputPath, edlPath, args, mock: true, preset };
  }

  try {
    await execFileAsync('ffmpeg', args, { maxBuffer: 20 * 1024 * 1024 });
    return { outputPath: options.outputPath, args, mock: false, preset };
  } catch (err) {
    console.warn(
      '[render-worker] ffmpeg failed, writing EDL stub:',
      err instanceof Error ? err.message : err,
    );
    const edlPath = await writeEdlMaster(timeline, options.assetPathMap, options.outputPath, preset);
    return { outputPath: options.outputPath, edlPath, args, mock: true, preset };
  }
}

/** Convenience: write args to a sidecar .ffmpeg.txt next to output. */
export async function dumpFfmpegArgs(args: string[], besidePath: string): Promise<string> {
  const path = join(dirname(besidePath), `${besidePath.split(/[/\\]/).pop()}.ffmpeg.txt`);
  await fs.writeFile(path, ['ffmpeg', ...args].join(' '), 'utf8');
  return path;
}

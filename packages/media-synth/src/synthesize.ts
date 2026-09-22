import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hasFfmpeg } from './detect.js';

export interface VideoSynthSpec {
  durationSec: number;
  width: number;
  height: number;
  fps?: number;
  seed: number;
  /** Burned-in text e.g. shot code */
  label?: string;
  /** Hex or ffmpeg color name; derived from seed if omitted */
  color?: string;
}

export interface ImageSynthSpec {
  width: number;
  height: number;
  seed: number;
  label?: string;
}

export interface AudioSynthSpec {
  durationSec: number;
  seed: number;
  kind: 'voice' | 'music';
}

export interface SynthResult {
  buffer: Buffer;
  mimeType: string;
  ext: string;
  path?: string;
}

function seedRgb(seed: number): { r: number; g: number; b: number; hex: string } {
  const r = (seed >>> 16) & 0xff;
  const g = (seed >>> 8) & 0xff;
  const b = seed & 0xff;
  const hex = ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
  return { r, g, b, hex };
}

function seedFreq(seed: number): number {
  return (Math.abs(seed) % 400) + 200;
}

function evenDim(n: number): number {
  const v = Math.max(2, Math.trunc(n));
  return v % 2 === 0 ? v : v + 1;
}

function escapeDrawtext(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'");
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stderr = '';
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-800)}`));
    });
  });
}

async function withTempFile(ext: string, write: (path: string) => Promise<void>): Promise<Buffer> {
  const path = join(tmpdir(), `studioos-synth-${randomBytes(8).toString('hex')}.${ext}`);
  try {
    await write(path);
    return await fs.readFile(path);
  } finally {
    await fs.unlink(path).catch(() => undefined);
  }
}

/** Minimal ftyp+mdat MP4 container (not a full bitstream, but structurally recognizable). */
function minimalMp4Buffer(note: string): Buffer {
  const ftyp = Buffer.from([
    0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x02,
    0x00, 0x69, 0x73, 0x6f, 0x6d, 0x6d, 0x70, 0x34, 0x31,
  ]);
  const payload = Buffer.from(note, 'utf8');
  const mdatHeader = Buffer.alloc(8);
  mdatHeader.writeUInt32BE(8 + payload.length, 0);
  mdatHeader.write('mdat', 4);
  return Buffer.concat([ftyp, mdatHeader, payload]);
}

function buildSvg(spec: ImageSynthSpec): string {
  const { width, height, seed, label } = spec;
  const { r, g, b } = seedRgb(seed);
  const r2 = (r + 80) % 256;
  const g2 = (g + 40) % 256;
  const b2 = (b + 120) % 256;
  const text = label ?? `mock ${seed}`;
  const fontSize = Math.max(12, Math.floor(Math.min(width, height) / 16));
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">`,
    `<stop offset="0%" stop-color="rgb(${r},${g},${b})"/>`,
    `<stop offset="100%" stop-color="rgb(${r2},${g2},${b2})"/>`,
    `</linearGradient></defs>`,
    `<rect width="100%" height="100%" fill="url(#g)"/>`,
    `<text x="50%" y="48%" dominant-baseline="middle" text-anchor="middle" fill="#fff" font-family="sans-serif" font-size="${fontSize}">`,
    escapeXml(text),
    `</text>`,
    `<text x="50%" y="58%" dominant-baseline="middle" text-anchor="middle" fill="rgba(255,255,255,0.7)" font-family="sans-serif" font-size="${Math.max(10, Math.floor(fontSize * 0.55))}">`,
    `seed ${seed}`,
    `</text>`,
    `</svg>`,
  ].join('');
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Minimal WAV: 16-bit mono PCM silence (or low-amplitude tone-ish noise from seed). */
function minimalWavBuffer(durationSec: number, seed: number, kind: 'voice' | 'music'): Buffer {
  const sampleRate = 22050;
  const numSamples = Math.max(1, Math.floor(durationSec * sampleRate));
  const dataSize = numSamples * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  const freq = seedFreq(seed);
  const amp = kind === 'music' ? 0.18 : 0.12;
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const sample = Math.sin(2 * Math.PI * freq * t) * amp * 32767;
    buffer.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(sample))), 44 + i * 2);
  }
  return buffer;
}

export async function synthesizeVideo(spec: VideoSynthSpec): Promise<SynthResult> {
  const durationSec = Math.max(0.1, spec.durationSec);
  const width = evenDim(spec.width);
  const height = evenDim(spec.height);
  const fps = Math.max(1, Math.trunc(spec.fps ?? 12));
  const { hex } = seedRgb(spec.seed);
  const color = spec.color ?? `0x${hex}`;
  const freq = seedFreq(spec.seed);

  if (await hasFfmpeg()) {
    try {
      const buffer = await withTempFile('mp4', async (outPath) => {
        const baseArgs = [
          '-y',
          '-f',
          'lavfi',
          '-i',
          `color=c=${color}:s=${width}x${height}:d=${durationSec}:r=${fps}`,
          '-f',
          'lavfi',
          '-i',
          `sine=f=${freq}:d=${durationSec}`,
          '-c:v',
          'libx264',
          '-pix_fmt',
          'yuv420p',
          '-c:a',
          'aac',
          '-shortest',
        ];

        if (spec.label) {
          const vf = `drawtext=text='${escapeDrawtext(spec.label)}':fontsize=36:fontcolor=white:x=40:y=40`;
          try {
            await runFfmpeg([...baseArgs, '-vf', vf, outPath]);
            return;
          } catch {
            // drawtext often needs a system font; retry without burned-in text
          }
        }

        await runFfmpeg([...baseArgs, outPath]);
      });

      return { buffer, mimeType: 'video/mp4', ext: 'mp4' };
    } catch {
      // fall through to buffer fallback
    }
  }

  const note = `StudioOS mock video\nseed=${spec.seed}\nduration=${durationSec}\nlabel=${spec.label ?? ''}\n`;
  return {
    buffer: minimalMp4Buffer(note),
    mimeType: 'video/mp4',
    ext: 'mp4',
  };
}

export async function synthesizeImage(spec: ImageSynthSpec): Promise<SynthResult> {
  const width = Math.max(1, Math.trunc(spec.width));
  const height = Math.max(1, Math.trunc(spec.height));
  const svg = buildSvg({ ...spec, width, height });
  return {
    buffer: Buffer.from(svg, 'utf8'),
    mimeType: 'image/svg+xml',
    ext: 'svg',
  };
}

export async function synthesizeAudio(spec: AudioSynthSpec): Promise<SynthResult> {
  const durationSec = Math.max(0.1, spec.durationSec);
  const freq =
    spec.kind === 'music' ? seedFreq(spec.seed) * 0.5 + 100 : seedFreq(spec.seed);

  if (await hasFfmpeg()) {
    try {
      const buffer = await withTempFile('wav', async (outPath) => {
        await runFfmpeg([
          '-y',
          '-f',
          'lavfi',
          '-i',
          `sine=f=${freq}:d=${durationSec}`,
          outPath,
        ]);
      });
      return { buffer, mimeType: 'audio/wav', ext: 'wav' };
    } catch {
      // fall through
    }
  }

  return {
    buffer: minimalWavBuffer(durationSec, spec.seed, spec.kind),
    mimeType: 'audio/wav',
    ext: 'wav',
  };
}

export interface StemsSynthSpec {
  durationSec: number;
  seed: number;
  /** Stem names; defaults to drums/bass/other/vocals */
  names?: string[];
  /** Optional directory to write stem wav files into */
  outDir?: string;
}

export interface StemFile {
  name: string;
  buffer: Buffer;
  mimeType: string;
  ext: string;
  path?: string;
}

export interface StemsSynthResult {
  stems: StemFile[];
  /** Manifest JSON buffer listing stem files */
  buffer: Buffer;
  mimeType: string;
  ext: string;
  dir?: string;
}

export interface MidiSynthSpec {
  durationSec?: number;
  seed: number;
  /** MIDI note numbers; derived from seed if omitted */
  notes?: number[];
  tempoBpm?: number;
}

export interface LutSynthSpec {
  seed: number;
  size?: 16 | 32 | 64;
  label?: string;
}

export interface MatteSynthSpec {
  width: number;
  height: number;
  seed: number;
  /** Softness of the elliptical matte edge 0–1 */
  softness?: number;
  label?: string;
}

const DEFAULT_STEM_NAMES = ['drums', 'bass', 'other', 'vocals'] as const;

/** Multiple mono WAV stems (different freqs) + JSON manifest. */
export async function synthesizeStems(spec: StemsSynthSpec): Promise<StemsSynthResult> {
  const durationSec = Math.max(0.1, spec.durationSec);
  const names = spec.names?.length ? spec.names : [...DEFAULT_STEM_NAMES];
  const stems: StemFile[] = [];

  for (let i = 0; i < names.length; i++) {
    const name = names[i]!;
    const stemSeed = (spec.seed + i * 9973) >>> 0;
    const audio = await synthesizeAudio({
      durationSec: Math.min(durationSec, 2),
      seed: stemSeed,
      kind: i % 2 === 0 ? 'music' : 'voice',
    });
    stems.push({
      name,
      buffer: audio.buffer,
      mimeType: audio.mimeType,
      ext: audio.ext,
    });
  }

  let dir = spec.outDir;
  if (dir) {
    await fs.mkdir(dir, { recursive: true });
    for (const stem of stems) {
      const path = join(dir, `${stem.name}.${stem.ext}`);
      await fs.writeFile(path, stem.buffer);
      stem.path = path;
    }
  }

  const manifest = {
    mock: true,
    seed: spec.seed,
    durationSec,
    stems: stems.map((s) => ({
      name: s.name,
      file: s.path ? s.path.split(/[/\\]/).pop() : `${s.name}.${s.ext}`,
      mimeType: s.mimeType,
    })),
  };
  const buffer = Buffer.from(JSON.stringify(manifest, null, 2), 'utf8');
  return {
    stems,
    buffer,
    mimeType: 'application/json',
    ext: 'json',
    dir,
  };
}

/** Minimal Type-0 SMF (Standard MIDI File) with a short note sequence. */
export function synthesizeMidi(spec: MidiSynthSpec): SynthResult {
  const tempoBpm = Math.max(40, Math.min(240, Math.trunc(spec.tempoBpm ?? 120)));
  const durationSec = Math.max(0.5, spec.durationSec ?? 4);
  const notes =
    spec.notes?.length && spec.notes.length > 0
      ? spec.notes.map((n) => Math.max(0, Math.min(127, Math.trunc(n))))
      : [
          60 + (spec.seed % 12),
          64 + (spec.seed % 7),
          67 + (spec.seed % 5),
          72 + (spec.seed % 3),
        ];

  const ticksPerQuarter = 480;
  const microsPerQuarter = Math.round(60_000_000 / tempoBpm);
  const noteTicks = Math.max(60, Math.floor(ticksPerQuarter / 2));
  const totalTicks = Math.max(noteTicks * notes.length, Math.floor((durationSec * tempoBpm * ticksPerQuarter) / 60));

  const trackParts: number[] = [];

  // Tempo meta
  trackParts.push(0x00, 0xff, 0x51, 0x03);
  trackParts.push((microsPerQuarter >> 16) & 0xff, (microsPerQuarter >> 8) & 0xff, microsPerQuarter & 0xff);

  let tickCursor = 0;
  for (let i = 0; i < notes.length; i++) {
    const note = notes[i]!;
    const deltaOn = i === 0 ? 0 : noteTicks;
    tickCursor += deltaOn;
    writeVarLen(trackParts, deltaOn);
    trackParts.push(0x90, note, 0x64); // note on ch0 vel 100
    writeVarLen(trackParts, noteTicks);
    tickCursor += noteTicks;
    trackParts.push(0x80, note, 0x40); // note off
  }

  // Pad remaining time then end of track
  const remaining = Math.max(0, totalTicks - tickCursor);
  writeVarLen(trackParts, remaining);
  trackParts.push(0xff, 0x2f, 0x00);

  const trackData = Buffer.from(trackParts);
  const header = Buffer.alloc(14);
  header.write('MThd', 0);
  header.writeUInt32BE(6, 4);
  header.writeUInt16BE(0, 8); // format 0
  header.writeUInt16BE(1, 10); // one track
  header.writeUInt16BE(ticksPerQuarter, 12);

  const trackHeader = Buffer.alloc(8);
  trackHeader.write('MTrk', 0);
  trackHeader.writeUInt32BE(trackData.length, 4);

  return {
    buffer: Buffer.concat([header, trackHeader, trackData]),
    mimeType: 'audio/midi',
    ext: 'mid',
  };
}

function writeVarLen(out: number[], value: number): void {
  let v = Math.max(0, Math.trunc(value));
  const bytes: number[] = [];
  bytes.push(v & 0x7f);
  v >>= 7;
  while (v > 0) {
    bytes.push((v & 0x7f) | 0x80);
    v >>= 7;
  }
  for (let i = bytes.length - 1; i >= 0; i--) out.push(bytes[i]!);
}

/** Generate a minimal .cube 3D LUT text file. */
export function synthesizeLut(spec: LutSynthSpec): SynthResult {
  const size = spec.size === 64 || spec.size === 32 ? spec.size : 16;
  const { r, g, b } = seedRgb(spec.seed);
  const liftR = (r / 255) * 0.08;
  const liftG = (g / 255) * 0.08;
  const liftB = (b / 255) * 0.08;
  const lines: string[] = [
    `# StudioOS mock LUT seed=${spec.seed} ${spec.label ?? ''}`.trim(),
    `TITLE "StudioOS LUT ${spec.seed}"`,
    `LUT_3D_SIZE ${size}`,
  ];

  for (let zi = 0; zi < size; zi++) {
    for (let yi = 0; yi < size; yi++) {
      for (let xi = 0; xi < size; xi++) {
        const x = xi / (size - 1);
        const y = yi / (size - 1);
        const z = zi / (size - 1);
        const outR = Math.min(1, Math.max(0, x + liftR * (1 - x)));
        const outG = Math.min(1, Math.max(0, y + liftG * (1 - y)));
        const outB = Math.min(1, Math.max(0, z + liftB * (1 - z)));
        lines.push(`${outR.toFixed(6)} ${outG.toFixed(6)} ${outB.toFixed(6)}`);
      }
    }
  }

  return {
    buffer: Buffer.from(lines.join('\n') + '\n', 'utf8'),
    mimeType: 'application/cube',
    ext: 'cube',
  };
}

/** Soft elliptical matte as SVG with alpha (or PNG via ffmpeg when available). */
export async function synthesizeMatte(spec: MatteSynthSpec): Promise<SynthResult> {
  const width = Math.max(2, Math.trunc(spec.width));
  const height = Math.max(2, Math.trunc(spec.height));
  const softness = Math.min(1, Math.max(0, spec.softness ?? 0.15));
  const cx = width / 2;
  const cy = height / 2;
  const rx = width * (0.35 + (spec.seed % 20) / 100);
  const ry = height * (0.4 + (spec.seed % 15) / 100);
  const blur = Math.max(1, Math.floor(Math.min(width, height) * softness * 0.08));

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<defs><filter id="f"><feGaussianBlur stdDeviation="${blur}"/></filter></defs>`,
    `<rect width="100%" height="100%" fill="black"/>`,
    `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="white" filter="url(#f)"/>`,
    spec.label
      ? `<text x="50%" y="92%" text-anchor="middle" fill="#888" font-family="sans-serif" font-size="12">${escapeXml(spec.label)}</text>`
      : '',
    `</svg>`,
  ].join('');

  if (await hasFfmpeg()) {
    try {
      const buffer = await withTempFile('png', async (outPath) => {
        const svgPath = join(tmpdir(), `studioos-matte-${randomBytes(6).toString('hex')}.svg`);
        await fs.writeFile(svgPath, svg, 'utf8');
        try {
          await runFfmpeg(['-y', '-i', svgPath, '-pix_fmt', 'rgba', outPath]);
        } finally {
          await fs.unlink(svgPath).catch(() => undefined);
        }
      });
      return { buffer, mimeType: 'image/png', ext: 'png' };
    } catch {
      // fall through to SVG
    }
  }

  return {
    buffer: Buffer.from(svg, 'utf8'),
    mimeType: 'image/svg+xml',
    ext: 'svg',
  };
}

/** Deterministic hash of a string into an unsigned 32-bit seed. */
export function hashToSeed(input: string): number {
  const digest = createHash('sha256').update(input).digest();
  return digest.readUInt32BE(0);
}

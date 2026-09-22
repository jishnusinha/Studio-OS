import { createHash } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { dirname, extname } from 'node:path';
import { promisify } from 'node:util';
import { platform } from 'node:os';

const execFileAsync = promisify(execFile);

export interface ProbeResult {
  width: number;
  height: number;
  duration: number;
  fps: number;
  codec: string;
  sizeBytes: number;
}

export interface WaveformResult {
  peaks: number[];
  amplitudes: number[];
  mock: boolean;
  source: string;
  duration?: number;
  sampleCount?: number;
}

export interface LoudnessResult {
  /** Integrated loudness in LUFS (EBU R128). */
  integratedLufs: number | null;
  truePeak?: number | null;
  loudnessRange?: number | null;
  mock: boolean;
}

export interface MediaServiceOptions {
  /** Force mock mode regardless of ffmpeg availability. */
  forceMock?: boolean;
}

let ffmpegPathCache: string | null | undefined;
let ffprobePathCache: string | null | undefined;

/** Detect ffmpeg binary; returns path or null. */
export async function detectFfmpeg(): Promise<string | null> {
  if (ffmpegPathCache !== undefined) return ffmpegPathCache;

  const cmd = platform() === 'win32' ? 'where' : 'which';
  try {
    const { stdout } = await execFileAsync(cmd, ['ffmpeg']);
    const first = stdout
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l.length > 0);
    ffmpegPathCache = first ?? null;
  } catch {
    ffmpegPathCache = null;
  }
  return ffmpegPathCache;
}

/** Detect ffprobe binary; returns path or null. */
export async function detectFfprobe(): Promise<string | null> {
  if (ffprobePathCache !== undefined) return ffprobePathCache;

  const cmd = platform() === 'win32' ? 'where' : 'which';
  try {
    const { stdout } = await execFileAsync(cmd, ['ffprobe']);
    const first = stdout
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l.length > 0);
    ffprobePathCache = first ?? null;
  } catch {
    ffprobePathCache = null;
  }
  return ffprobePathCache;
}

/** Reset cached ffmpeg/ffprobe detection (tests). */
export function resetFfmpegCache(): void {
  ffmpegPathCache = undefined;
  ffprobePathCache = undefined;
}

function extensionOf(path: string): string {
  return extname(path).toLowerCase().replace(/^\./, '');
}

function mockProbeForExtension(ext: string, sizeBytes: number): ProbeResult {
  if (['mp4', 'mov', 'webm', 'mkv', 'avi', 'm4v'].includes(ext)) {
    return { width: 1920, height: 1080, duration: 10, fps: 24, codec: 'h264', sizeBytes };
  }
  if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'svg'].includes(ext)) {
    return { width: 1024, height: 1024, duration: 0, fps: 0, codec: ext === 'png' ? 'png' : 'jpeg', sizeBytes };
  }
  if (['mp3', 'wav', 'aac', 'flac', 'm4a', 'ogg'].includes(ext)) {
    return { width: 0, height: 0, duration: 30, fps: 0, codec: ext === 'wav' ? 'pcm' : 'aac', sizeBytes };
  }
  return { width: 640, height: 360, duration: 5, fps: 24, codec: 'unknown', sizeBytes };
}

function fabricatedPeaks(count: number, seed = 1): number[] {
  return Array.from({ length: count }, (_, i) =>
    Number((Math.abs(Math.sin(i * 0.37 + seed)) * 0.85).toFixed(4)),
  );
}

async function ensureDirFor(filePath: string): Promise<void> {
  await fs.mkdir(dirname(filePath), { recursive: true });
}

async function copyOrWritePlaceholder(input: string, output: string, note: string): Promise<void> {
  await ensureDirFor(output);
  try {
    await fs.copyFile(input, output);
  } catch {
    await fs.writeFile(output, `${note}\nsource=${input}\n`, 'utf8');
  }
}

function peaksFromPcmS16le(pcm: Buffer, bucketCount: number): number[] {
  const sampleCount = Math.floor(pcm.length / 2);
  if (sampleCount <= 0) return fabricatedPeaks(bucketCount);
  const buckets = Math.max(1, bucketCount);
  const peaks: number[] = [];
  for (let b = 0; b < buckets; b++) {
    const start = Math.floor((b / buckets) * sampleCount);
    const end = Math.floor(((b + 1) / buckets) * sampleCount);
    let peak = 0;
    for (let i = start; i < end; i++) {
      const sample = Math.abs(pcm.readInt16LE(i * 2)) / 32768;
      if (sample > peak) peak = sample;
    }
    peaks.push(Number(peak.toFixed(4)));
  }
  return peaks;
}

function parseFfprobeJson(jsonText: string, sizeBytes: number): ProbeResult | null {
  try {
    const data = JSON.parse(jsonText) as {
      format?: { duration?: string; size?: string };
      streams?: Array<{
        codec_type?: string;
        codec_name?: string;
        width?: number;
        height?: number;
        avg_frame_rate?: string;
        r_frame_rate?: string;
        duration?: string;
      }>;
    };
    const streams = data.streams ?? [];
    const video = streams.find((s) => s.codec_type === 'video');
    const audio = streams.find((s) => s.codec_type === 'audio');
    const formatDuration = Number(data.format?.duration ?? NaN);
    const streamDuration = Number(video?.duration ?? audio?.duration ?? NaN);
    const duration =
      Number.isFinite(formatDuration) && formatDuration > 0
        ? formatDuration
        : Number.isFinite(streamDuration) && streamDuration > 0
          ? streamDuration
          : 0;
    const sizeFromFormat = Number(data.format?.size ?? NaN);
    const resolvedSize = Number.isFinite(sizeFromFormat) ? sizeFromFormat : sizeBytes;

    const parseFps = (rate?: string): number => {
      if (!rate || rate === '0/0') return 0;
      const [n, d] = rate.split('/').map(Number);
      if (!d || !Number.isFinite(n) || !Number.isFinite(d)) return Number(rate) || 0;
      return n / d;
    };

    if (video) {
      return {
        width: video.width ?? 0,
        height: video.height ?? 0,
        duration,
        fps: parseFps(video.avg_frame_rate) || parseFps(video.r_frame_rate) || 24,
        codec: video.codec_name ?? 'h264',
        sizeBytes: resolvedSize,
      };
    }

    if (audio) {
      return {
        width: 0,
        height: 0,
        duration,
        fps: 0,
        codec: audio.codec_name ?? 'aac',
        sizeBytes: resolvedSize,
      };
    }

    return null;
  } catch {
    return null;
  }
}

function parseFfmpegStderrProbe(stderr: string, sizeBytes: number, ext: string): ProbeResult {
  const durationMatch = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr);
  let duration = 0;
  if (durationMatch) {
    const h = Number(durationMatch[1]);
    const m = Number(durationMatch[2]);
    const s = Number(durationMatch[3]);
    duration = h * 3600 + m * 60 + s;
  }

  const videoMatch = /Stream #.*Video:\s*(\w+)[^,]*,.*?(\d{2,5})x(\d{2,5}).*?([\d.]+)\s*fps/i.exec(
    stderr,
  );
  const audioMatch = /Stream #.*Audio:\s*(\w+)/i.exec(stderr);

  if (videoMatch) {
    return {
      width: Number(videoMatch[2]),
      height: Number(videoMatch[3]),
      duration,
      fps: Number(videoMatch[4]) || 24,
      codec: videoMatch[1] ?? 'h264',
      sizeBytes,
    };
  }

  if (audioMatch) {
    return {
      width: 0,
      height: 0,
      duration,
      fps: 0,
      codec: audioMatch[1] ?? 'aac',
      sizeBytes,
    };
  }

  return mockProbeForExtension(ext, sizeBytes);
}

function parseEbur128(stderr: string): LoudnessResult | null {
  // Integrated loudness: I: -23.0 LUFS
  const integrated =
    /I:\s*(-?\d+(?:\.\d+)?)\s*LUFS/i.exec(stderr) ??
    /Integrated loudness:\s*I:\s*(-?\d+(?:\.\d+)?)/i.exec(stderr);
  if (!integrated) return null;

  const truePeakMatch = /Peak:\s*(-?\d+(?:\.\d+)?)\s*dBFS/i.exec(stderr);
  const lraMatch = /LRA:\s*(-?\d+(?:\.\d+)?)\s*LU/i.exec(stderr);

  return {
    integratedLufs: Number(integrated[1]),
    truePeak: truePeakMatch ? Number(truePeakMatch[1]) : null,
    loudnessRange: lraMatch ? Number(lraMatch[1]) : null,
    mock: false,
  };
}

export {
  materializeMockUri,
  type MaterializeResult,
} from '@studio-os/media-synth';

export class MediaService {
  private mockMode: boolean | null = null;
  private readonly forceMock: boolean;

  constructor(options: MediaServiceOptions = {}) {
    this.forceMock = options.forceMock === true;
  }

  async isMockMode(): Promise<boolean> {
    if (this.forceMock) return true;
    if (this.mockMode !== null) return this.mockMode;
    const path = await detectFfmpeg();
    this.mockMode = path === null;
    return this.mockMode;
  }

  private async ffmpegBin(): Promise<string> {
    const path = await detectFfmpeg();
    if (!path) throw new Error('ffmpeg not available');
    return path;
  }

  private async runFfmpeg(args: string[]): Promise<{ stdout: string; stderr: string }> {
    const bin = await this.ffmpegBin();
    return new Promise((resolve, reject) => {
      const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      child.stdout?.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      child.stderr?.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) resolve({ stdout, stderr });
        else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-500)}`));
      });
    });
  }

  private async runFfmpegCapture(
    args: string[],
  ): Promise<{ code: number; stdout: Buffer; stderr: string }> {
    const bin = await this.ffmpegBin();
    return new Promise((resolve, reject) => {
      const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      const chunks: Buffer[] = [];
      let stderr = '';
      child.stdout?.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });
      child.stderr?.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      child.on('error', reject);
      child.on('close', (code) => {
        resolve({ code: code ?? 1, stdout: Buffer.concat(chunks), stderr });
      });
    });
  }

  async probe(inputPath: string): Promise<ProbeResult> {
    let sizeBytes = 0;
    try {
      const stat = await fs.stat(inputPath);
      sizeBytes = stat.size;
    } catch {
      sizeBytes = 0;
    }

    if (await this.isMockMode()) {
      return mockProbeForExtension(extensionOf(inputPath), sizeBytes);
    }

    const ffprobe = await detectFfprobe();
    if (ffprobe) {
      try {
        const { stdout } = await execFileAsync(
          ffprobe,
          ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', inputPath],
          { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
        );
        const parsed = parseFfprobeJson(stdout, sizeBytes);
        if (parsed) return parsed;
      } catch {
        // fall through to ffmpeg -i
      }
    }

    try {
      const bin = await this.ffmpegBin();
      const { stderr } = await execFileAsync(bin, ['-hide_banner', '-i', inputPath], {
        encoding: 'utf8',
      }).catch((err: { stderr?: string }) => ({ stderr: err.stderr ?? '' }));

      return parseFfmpegStderrProbe(stderr, sizeBytes, extensionOf(inputPath));
    } catch {
      return mockProbeForExtension(extensionOf(inputPath), sizeBytes);
    }
  }

  async generateProxy(input: string, output: string): Promise<string> {
    await ensureDirFor(output);
    if (await this.isMockMode()) {
      await copyOrWritePlaceholder(input, output, 'StudioOS mock proxy');
      return output;
    }

    await this.runFfmpeg([
      '-y',
      '-i',
      input,
      '-vf',
      'scale=-2:720',
      '-c:v',
      'libx264',
      '-preset',
      'fast',
      '-crf',
      '23',
      '-c:a',
      'aac',
      '-movflags',
      '+faststart',
      output,
    ]);
    return output;
  }

  async generatePoster(input: string, output: string): Promise<string> {
    await ensureDirFor(output);
    if (await this.isMockMode()) {
      const jpegStub = Buffer.from([
        0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00,
        0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06,
        0x05, 0x08, 0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b,
        0x0c, 0x19, 0x12, 0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20,
        0x24, 0x2e, 0x27, 0x20, 0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29, 0x2c, 0x30, 0x31,
        0x34, 0x34, 0x34, 0x1f, 0x27, 0x39, 0x3d, 0x38, 0x32, 0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff,
        0xd9,
      ]);
      await fs.writeFile(output, jpegStub);
      return output;
    }

    await this.runFfmpeg(['-y', '-i', input, '-ss', '0', '-frames:v', '1', '-q:v', '2', output]);
    return output;
  }

  /**
   * Produce a contact-sheet sprite: sample every N seconds, scale tiles, tile into a grid.
   */
  async generateSprite(input: string, output: string, intervalSec = 5): Promise<string> {
    await ensureDirFor(output);
    if (await this.isMockMode()) {
      await fs.writeFile(output, `StudioOS mock sprite\nsource=${input}\n`, 'utf8');
      return output;
    }

    const probe = await this.probe(input);
    const duration = Math.max(probe.duration, 1);
    const n = Math.max(1, Math.min(25, Math.ceil(duration / Math.max(0.5, intervalSec))));
    const cols = Math.min(5, n);
    const rows = Math.ceil(n / cols);
    const interval = Math.max(0.5, duration / n);

    try {
      await this.runFfmpeg([
        '-y',
        '-i',
        input,
        '-vf',
        `fps=1/${interval},scale=160:-1,tile=${cols}x${rows}`,
        '-frames:v',
        '1',
        '-q:v',
        '3',
        output,
      ]);
    } catch {
      try {
        // Fallback fixed 5s interval 5x5 sheet
        await this.runFfmpeg([
          '-y',
          '-i',
          input,
          '-vf',
          'fps=1/5,scale=160:-1,tile=5x5',
          '-frames:v',
          '1',
          output,
        ]);
      } catch {
        await fs.writeFile(output, `StudioOS sprite stub\nsource=${input}\n`, 'utf8');
      }
    }
    return output;
  }

  /** Decode PCM peaks for waveform JSON + metadata. */
  async extractPeaks(input: string, bucketCount?: number): Promise<WaveformResult> {
    const probe = await this.probe(input).catch(() =>
      mockProbeForExtension(extensionOf(input), 0),
    );
    const count =
      bucketCount ?? Math.max(16, Math.min(256, Math.floor((probe.duration || 1) * 8) || 64));

    if (await this.isMockMode()) {
      const peaks = fabricatedPeaks(count);
      return {
        peaks,
        amplitudes: peaks,
        mock: true,
        source: input,
        duration: probe.duration,
        sampleCount: count,
      };
    }

    try {
      // Decode mono s16le PCM at 8kHz for compact peak sampling
      const { code, stdout, stderr } = await this.runFfmpegCapture([
        '-hide_banner',
        '-i',
        input,
        '-vn',
        '-ac',
        '1',
        '-ar',
        '8000',
        '-f',
        's16le',
        'pipe:1',
      ]);

      if (code === 0 && stdout.length >= 2) {
        const peaks = peaksFromPcmS16le(stdout, count);
        return {
          peaks,
          amplitudes: peaks,
          mock: false,
          source: input,
          duration: probe.duration,
          sampleCount: count,
        };
      }

      // Fallback: astats Peak_level metadata periodically
      const astats = await this.runFfmpegCapture([
        '-hide_banner',
        '-i',
        input,
        '-af',
        'astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.Peak_level',
        '-f',
        'null',
        '-',
      ]);
      const peakMatches = [
        ...astats.stderr.matchAll(/lavfi\.astats\.Overall\.Peak_level\s*=\s*(-?\d+(?:\.\d+)?)/g),
      ];
      if (peakMatches.length > 0) {
        const dbPeaks = peakMatches.map((m) => Number(m[1]));
        const linear = dbPeaks.map((db) => {
          if (!Number.isFinite(db) || db <= -90) return 0;
          return Number(Math.min(1, Math.pow(10, db / 20)).toFixed(4));
        });
        // Resample to requested bucket count
        const peaks: number[] = [];
        for (let i = 0; i < count; i++) {
          const idx = Math.min(linear.length - 1, Math.floor((i / count) * linear.length));
          peaks.push(linear[idx] ?? 0);
        }
        return {
          peaks,
          amplitudes: peaks,
          mock: false,
          source: input,
          duration: probe.duration,
          sampleCount: count,
        };
      }

      void stderr;
    } catch {
      // fall through
    }

    const peaks = fabricatedPeaks(count);
    return {
      peaks,
      amplitudes: peaks,
      mock: true,
      source: input,
      duration: probe.duration,
      sampleCount: count,
    };
  }

  async generateWaveform(input: string, outputJson: string): Promise<string> {
    await ensureDirFor(outputJson);
    const waveform = await this.extractPeaks(input);
    await fs.writeFile(
      outputJson,
      JSON.stringify({
        peaks: waveform.peaks,
        amplitudes: waveform.amplitudes,
        mock: waveform.mock,
        source: waveform.source,
        duration: waveform.duration,
        sampleCount: waveform.sampleCount,
      }),
      'utf8',
    );
    return outputJson;
  }

  /** EBU R128 integrated loudness via ffmpeg ebur128 filter. */
  async measureLoudness(input: string): Promise<LoudnessResult> {
    if (await this.isMockMode()) {
      return { integratedLufs: -23, truePeak: -1, loudnessRange: 5, mock: true };
    }

    try {
      const { stderr } = await this.runFfmpegCapture([
        '-hide_banner',
        '-i',
        input,
        '-af',
        'ebur128=peak=true',
        '-f',
        'null',
        '-',
      ]);
      const parsed = parseEbur128(stderr);
      if (parsed) return parsed;
    } catch (err) {
      // ebur128 may still print summary before non-zero exit on some builds
      if (err instanceof Error) {
        const parsed = parseEbur128(err.message);
        if (parsed) return parsed;
      }
    }

    // Second attempt: framelog verbose
    try {
      const result = await this.runFfmpegCapture([
        '-hide_banner',
        '-i',
        input,
        '-af',
        'ebur128=framelog=verbose',
        '-f',
        'null',
        '-',
      ]);
      const parsed = parseEbur128(result.stderr);
      if (parsed) return parsed;
    } catch {
      // fall through
    }

    return { integratedLufs: null, truePeak: null, loudnessRange: null, mock: true };
  }

  async fingerprint(input: string): Promise<string> {
    try {
      const data = await fs.readFile(input);
      return createHash('sha256').update(data).digest('hex');
    } catch {
      return createHash('sha256').update(input).digest('hex');
    }
  }

  /** Alias of probe. */
  async extractMetadata(input: string): Promise<ProbeResult> {
    return this.probe(input);
  }
}

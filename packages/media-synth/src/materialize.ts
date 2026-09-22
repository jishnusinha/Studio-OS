import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashToSeed, synthesizeAudio, synthesizeImage, synthesizeVideo, synthesizeStems, synthesizeMidi, synthesizeLut, synthesizeMatte } from './synthesize.js';

export interface MaterializeResult {
  path: string;
  mimeType: string;
}

function safeSlug(input: string, fallback: string): string {
  const cleaned = input.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
  return cleaned || fallback;
}

function parseMockParts(uri: string): { kind: string; rest: string; query: URLSearchParams } {
  const withoutScheme = uri.replace(/^mock:\/\//i, '');
  const qIndex = withoutScheme.indexOf('?');
  const pathPart = qIndex >= 0 ? withoutScheme.slice(0, qIndex) : withoutScheme;
  const query = new URLSearchParams(qIndex >= 0 ? withoutScheme.slice(qIndex + 1) : '');
  const slash = pathPart.indexOf('/');
  const kind = (slash >= 0 ? pathPart.slice(0, slash) : pathPart).toLowerCase();
  const rest = slash >= 0 ? pathPart.slice(slash + 1) : '';
  return { kind, rest, query };
}

function seedFromUri(uri: string, query: URLSearchParams, rest: string): number {
  const qSeed = query.get('seed');
  if (qSeed != null && Number.isFinite(Number(qSeed))) return Math.trunc(Number(qSeed));
  const num = /^(\d+)/.exec(rest);
  if (num) return Math.trunc(Number(num[1]));
  return hashToSeed(uri);
}

function durationFromQuery(query: URLSearchParams, fallback: number): number {
  const raw = query.get('duration') ?? query.get('durationSec') ?? query.get('d');
  if (raw != null && Number.isFinite(Number(raw))) return Math.max(0.1, Number(raw));
  return fallback;
}

function dimFromQuery(query: URLSearchParams, key: string, fallback: number): number {
  const raw = query.get(key);
  if (raw != null && Number.isFinite(Number(raw))) return Math.max(1, Math.trunc(Number(raw)));
  return fallback;
}

async function writeBuffer(outPath: string, buffer: Buffer): Promise<void> {
  await fs.mkdir(dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, buffer);
}

function decodeDataUri(uri: string): { buffer: Buffer; mimeType: string; ext: string } {
  const match = /^data:([^;,]+)?((?:;[^,]*)*),([\s\S]*)$/i.exec(uri);
  if (!match) {
    return { buffer: Buffer.from(uri, 'utf8'), mimeType: 'application/octet-stream', ext: 'bin' };
  }
  const mimeType = match[1] || 'application/octet-stream';
  const params = match[2] || '';
  const data = match[3] ?? '';
  const isBase64 = /;base64/i.test(params);
  const buffer = isBase64 ? Buffer.from(data, 'base64') : Buffer.from(decodeURIComponent(data), 'utf8');
  let ext = 'bin';
  if (mimeType.includes('svg')) ext = 'svg';
  else if (mimeType.includes('png')) ext = 'png';
  else if (mimeType.includes('jpeg') || mimeType.includes('jpg')) ext = 'jpg';
  else if (mimeType.includes('json')) ext = 'json';
  else if (mimeType.includes('wav')) ext = 'wav';
  else if (mimeType.includes('mp4')) ext = 'mp4';
  else if (mimeType.includes('mpeg') || mimeType.includes('mp3')) ext = 'mp3';
  return { buffer, mimeType, ext };
}

/**
 * Materialize a mock/file/data URI into a real file under outDir.
 */
export async function materializeMockUri(uri: string, outDir: string): Promise<MaterializeResult> {
  await fs.mkdir(outDir, { recursive: true });

  if (uri.startsWith('data:')) {
    const decoded = decodeDataUri(uri);
    const outPath = join(outDir, `data-${hashToSeed(uri).toString(16)}.${decoded.ext}`);
    await writeBuffer(outPath, decoded.buffer);
    return { path: outPath, mimeType: decoded.mimeType };
  }

  if (uri.startsWith('file://') || uri.startsWith('file:/')) {
    const src = fileURLToPath(uri);
    const base = safeSlug(src.split(/[/\\]/).pop() ?? 'file', 'file');
    const outPath = join(outDir, base);
    await fs.mkdir(dirname(outPath), { recursive: true });
    await fs.copyFile(src, outPath);
    return { path: outPath, mimeType: 'application/octet-stream' };
  }

  if (!/^mock:\/\//i.test(uri)) {
    const outPath = join(outDir, `${safeSlug(uri, 'asset')}.bin`);
    await writeBuffer(outPath, Buffer.from(`StudioOS asset\nuri=${uri}\n`, 'utf8'));
    return { path: outPath, mimeType: 'application/octet-stream' };
  }

  const { kind, rest, query } = parseMockParts(uri);
  const seed = seedFromUri(uri, query, rest);
  const slug = safeSlug(rest.replace(/\?.*$/, '') || kind, kind);

  if (kind === 'image' || kind.startsWith('image')) {
    const width = dimFromQuery(query, 'width', 1024);
    const height = dimFromQuery(query, 'height', 1024);
    const result = await synthesizeImage({
      width,
      height,
      seed,
      label: query.get('label') ?? `mock ${seed}`,
    });
    const outPath = join(outDir, `${slug || 'image'}.svg`);
    await writeBuffer(outPath, result.buffer);
    return { path: outPath, mimeType: result.mimeType };
  }

  if (kind === 'video' || kind.startsWith('video')) {
    const durationSec = durationFromQuery(query, 2);
    const width = dimFromQuery(query, 'width', 640);
    const height = dimFromQuery(query, 'height', 360);
    const result = await synthesizeVideo({
      durationSec,
      width,
      height,
      fps: dimFromQuery(query, 'fps', 12),
      seed,
      label: query.get('label') ?? undefined,
    });
    const outPath = join(outDir, `${slug || 'video'}.mp4`);
    await writeBuffer(outPath, result.buffer);
    return { path: outPath, mimeType: result.mimeType };
  }

  if (kind === 'voice' || kind.startsWith('voice')) {
    const durationSec = durationFromQuery(query, 1);
    const result = await synthesizeAudio({ durationSec, seed, kind: 'voice' });
    const outPath = join(outDir, `${slug || 'voice'}.wav`);
    await writeBuffer(outPath, result.buffer);
    return { path: outPath, mimeType: result.mimeType };
  }

  if (kind === 'music' || kind.startsWith('music') || kind === 'audio' || kind.startsWith('audio')) {
    const durationSec = durationFromQuery(query, 2);
    const result = await synthesizeAudio({
      durationSec,
      seed,
      kind: kind.startsWith('voice') ? 'voice' : 'music',
    });
    const outPath = join(outDir, `${slug || 'audio'}.wav`);
    await writeBuffer(outPath, result.buffer);
    return { path: outPath, mimeType: result.mimeType };
  }

  if (kind === 'embed' || kind.startsWith('embed')) {
    const data = query.get('data');
    let payload: string;
    if (data) {
      try {
        payload = decodeURIComponent(data);
      } catch {
        payload = data;
      }
    } else {
      payload = JSON.stringify({ mock: true, uri, seed });
    }
    const outPath = join(outDir, `${slug || 'embed'}.json`);
    await writeBuffer(outPath, Buffer.from(payload, 'utf8'));
    return { path: outPath, mimeType: 'application/json' };
  }

  if (kind === 'stems' || kind.startsWith('stems')) {
    const durationSec = durationFromQuery(query, 2);
    const stemDir = join(outDir, `stems-${seed}`);
    const result = await synthesizeStems({ durationSec, seed, outDir: stemDir });
    const outPath = join(stemDir, 'stems.json');
    await writeBuffer(outPath, result.buffer);
    return { path: outPath, mimeType: result.mimeType };
  }

  if (kind === 'midi' || kind.startsWith('midi')) {
    const durationSec = durationFromQuery(query, 4);
    const result = synthesizeMidi({ durationSec, seed });
    const outPath = join(outDir, `${slug || 'midi'}.mid`);
    await writeBuffer(outPath, result.buffer);
    return { path: outPath, mimeType: result.mimeType };
  }

  if (kind === 'lut' || kind.startsWith('lut') || kind === 'cube') {
    const sizeRaw = query.get('size');
    const size =
      sizeRaw === '32' || sizeRaw === '64' ? (Number(sizeRaw) as 32 | 64) : 16;
    const result = synthesizeLut({
      seed,
      size,
      label: query.get('label') ?? undefined,
    });
    const outPath = join(outDir, `${slug || 'lut'}.cube`);
    await writeBuffer(outPath, result.buffer);
    return { path: outPath, mimeType: result.mimeType };
  }

  if (kind === 'matte' || kind.startsWith('matte')) {
    const width = dimFromQuery(query, 'width', 512);
    const height = dimFromQuery(query, 'height', 512);
    const result = await synthesizeMatte({
      width,
      height,
      seed,
      label: query.get('label') ?? undefined,
    });
    const outPath = join(outDir, `${slug || 'matte'}.${result.ext}`);
    await writeBuffer(outPath, result.buffer);
    return { path: outPath, mimeType: result.mimeType };
  }

  const outPath = join(outDir, `${slug || 'asset'}.bin`);
  await writeBuffer(outPath, Buffer.from(`StudioOS mock asset\nuri=${uri}\n`, 'utf8'));
  return { path: outPath, mimeType: 'application/octet-stream' };
}

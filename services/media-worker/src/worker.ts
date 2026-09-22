import { createWriteStream, promises as fs } from 'node:fs';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';
import { Worker, type Job } from 'bullmq';
import { eq, desc } from 'drizzle-orm';
import { Redis } from 'ioredis';
import {
  MediaService,
  materializeMockUri,
  type LoudnessResult,
  type WaveformResult,
} from './media-service.js';

export const MEDIA_INGEST_QUEUE = 'media-ingest';

export interface MediaJobData {
  assetId: string;
  storageKey: string;
  projectId: string;
}

export interface MediaJobResult {
  assetId: string;
  projectId: string;
  fingerprint: string;
  probe: Awaited<ReturnType<MediaService['probe']>>;
  proxyKey?: string;
  thumbKey?: string;
  waveformKey?: string;
  spriteKey?: string;
  peaks?: number[];
  loudness?: LoudnessResult;
  mock: boolean;
}

export interface ProcessMediaJobOptions {
  workDir?: string;
  media?: MediaService;
  s3?: S3Client;
  bucket?: string;
  upload?: boolean;
  /** Skip DB persistence (tests). */
  persist?: boolean;
}

function createS3FromEnv(): S3Client | null {
  const endpoint = process.env.S3_ENDPOINT;
  const accessKeyId = process.env.S3_ACCESS_KEY;
  const secretAccessKey = process.env.S3_SECRET_KEY;
  if (!endpoint || !accessKeyId || !secretAccessKey) return null;

  const config: S3ClientConfig = {
    endpoint,
    region: process.env.S3_REGION ?? 'us-east-1',
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
  };
  return new S3Client(config);
}

async function downloadFromS3(
  s3: S3Client,
  bucket: string,
  key: string,
  destPath: string,
): Promise<void> {
  const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const body = res.Body;
  if (!body) throw new Error(`Empty S3 body for key ${key}`);
  const nodeStream =
    body instanceof Readable
      ? body
      : Readable.fromWeb(body as import('node:stream/web').ReadableStream);
  await pipeline(nodeStream, createWriteStream(destPath));
}

async function uploadToS3(
  s3: S3Client,
  bucket: string,
  key: string,
  filePath: string,
  contentType: string,
): Promise<void> {
  const body = await fs.readFile(filePath);
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

async function persistAssetVersionMetadata(opts: {
  assetId: string;
  probe: MediaJobResult['probe'];
  fingerprint: string;
  proxyKey?: string;
  thumbKey?: string;
  waveformKey?: string;
  spriteKey?: string;
  peaks: number[];
  loudness: LoudnessResult;
  waveform: WaveformResult;
}): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return;

  try {
    const { createDb, assetVersions } = await import('@studio-os/db');
    const db = createDb(databaseUrl);
    const [version] = await db
      .select()
      .from(assetVersions)
      .where(eq(assetVersions.assetId, opts.assetId))
      .orderBy(desc(assetVersions.version))
      .limit(1);

    if (!version) return;

    const prevMeta = (version.metadata ?? {}) as Record<string, unknown>;
    const metadata: Record<string, unknown> = {
      ...prevMeta,
      peaks: opts.peaks,
      loudness: {
        integratedLufs: opts.loudness.integratedLufs,
        truePeak: opts.loudness.truePeak ?? null,
        loudnessRange: opts.loudness.loudnessRange ?? null,
        mock: opts.loudness.mock,
      },
      waveform: {
        mock: opts.waveform.mock,
        sampleCount: opts.waveform.sampleCount,
        duration: opts.waveform.duration,
      },
    };

    await db
      .update(assetVersions)
      .set({
        fingerprint: opts.fingerprint,
        checksum: opts.fingerprint,
        width: opts.probe.width || null,
        height: opts.probe.height || null,
        durationSec: opts.probe.duration ? Math.round(opts.probe.duration) : null,
        fps: opts.probe.fps ? Math.round(opts.probe.fps) : null,
        codec: opts.probe.codec || null,
        proxyKey: opts.proxyKey ?? version.proxyKey,
        thumbnailKey: opts.thumbKey ?? version.thumbnailKey,
        waveformKey: opts.waveformKey ?? version.waveformKey,
        spriteKey: opts.spriteKey ?? version.spriteKey,
        metadata,
      })
      .where(eq(assetVersions.id, version.id));
  } catch (err) {
    console.warn(
      '[media-worker] failed to persist asset_versions metadata:',
      err instanceof Error ? err.message : err,
    );
  }
}

/**
 * Process a media-ingest job in-process (no Redis required).
 * Downloads from S3 or materializes mock:// URIs, then runs MediaService transforms.
 */
export async function processMediaJob(
  data: MediaJobData,
  options: ProcessMediaJobOptions = {},
): Promise<MediaJobResult> {
  const media = options.media ?? new MediaService();
  const workDir = options.workDir ?? join(process.cwd(), '.tmp', 'media', data.assetId);
  await fs.mkdir(workDir, { recursive: true });

  const s3 = options.s3 ?? createS3FromEnv();
  const bucket = options.bucket ?? process.env.S3_BUCKET ?? 'studio-os';
  const shouldUpload = options.upload !== false && s3 !== null;

  let inputPath: string;
  if (data.storageKey.startsWith('mock://')) {
    const materialized = await materializeMockUri(data.storageKey, workDir);
    inputPath = materialized.path;
  } else if (s3) {
    const ext = data.storageKey.includes('.')
      ? data.storageKey.slice(data.storageKey.lastIndexOf('.'))
      : '.bin';
    inputPath = join(workDir, `source${ext}`);
    try {
      await downloadFromS3(s3, bucket, data.storageKey, inputPath);
    } catch (err) {
      console.warn(
        `[media-worker] S3 download failed for ${data.storageKey}, writing placeholder:`,
        err instanceof Error ? err.message : err,
      );
      await fs.writeFile(inputPath, `placeholder for ${data.storageKey}\n`, 'utf8');
    }
  } else {
    inputPath = join(workDir, 'source.bin');
    await fs.writeFile(inputPath, `offline placeholder for ${data.storageKey}\n`, 'utf8');
  }

  const probe = await media.probe(inputPath);
  const fingerprint = await media.fingerprint(inputPath);

  const proxyPath = join(workDir, 'proxy.mp4');
  const posterPath = join(workDir, 'poster.jpg');
  const waveformPath = join(workDir, 'waveform.json');
  const spritePath = join(workDir, 'sprite.jpg');

  await media.generateProxy(inputPath, proxyPath);
  await media.generatePoster(inputPath, posterPath);
  await media.generateWaveform(inputPath, waveformPath);
  const waveformRaw = await fs.readFile(waveformPath, 'utf8');
  const waveformParsed = JSON.parse(waveformRaw) as {
    peaks?: number[];
    amplitudes?: number[];
    mock?: boolean;
    source?: string;
    duration?: number;
    sampleCount?: number;
  };
  const waveform: WaveformResult = {
    peaks: waveformParsed.peaks ?? waveformParsed.amplitudes ?? [],
    amplitudes: waveformParsed.amplitudes ?? waveformParsed.peaks ?? [],
    mock: waveformParsed.mock ?? true,
    source: waveformParsed.source ?? inputPath,
    duration: waveformParsed.duration,
    sampleCount: waveformParsed.sampleCount,
  };
  await media.generateSprite(inputPath, spritePath);
  const loudness = await media.measureLoudness(inputPath);

  const proxyKey = `${data.projectId}/${data.assetId}/proxy.mp4`;
  const thumbKey = `${data.projectId}/${data.assetId}/poster.jpg`;
  const waveformKey = `${data.projectId}/${data.assetId}/waveform.json`;
  const spriteKey = `${data.projectId}/${data.assetId}/sprite.jpg`;

  if (shouldUpload && s3) {
    try {
      await uploadToS3(s3, bucket, proxyKey, proxyPath, 'video/mp4');
      await uploadToS3(s3, bucket, thumbKey, posterPath, 'image/jpeg');
      await uploadToS3(s3, bucket, waveformKey, waveformPath, 'application/json');
      await uploadToS3(s3, bucket, spriteKey, spritePath, 'image/jpeg');
    } catch (err) {
      console.warn(
        '[media-worker] upload failed:',
        err instanceof Error ? err.message : err,
      );
    }
  }

  if (options.persist !== false) {
    await persistAssetVersionMetadata({
      assetId: data.assetId,
      probe,
      fingerprint,
      proxyKey: shouldUpload ? proxyKey : undefined,
      thumbKey: shouldUpload ? thumbKey : undefined,
      waveformKey: shouldUpload ? waveformKey : undefined,
      spriteKey: shouldUpload ? spriteKey : undefined,
      peaks: waveform.peaks,
      loudness,
      waveform,
    });
  }

  const result: MediaJobResult = {
    assetId: data.assetId,
    projectId: data.projectId,
    fingerprint,
    probe,
    proxyKey: shouldUpload ? proxyKey : undefined,
    thumbKey: shouldUpload ? thumbKey : undefined,
    waveformKey: shouldUpload ? waveformKey : undefined,
    spriteKey: shouldUpload ? spriteKey : undefined,
    peaks: waveform.peaks,
    loudness,
    mock: await media.isMockMode(),
  };

  console.log('[media-worker] processed', JSON.stringify({
    ...result,
    peaks: result.peaks?.length,
  }));
  return result;
}

export interface StartWorkerOptions {
  redisUrl?: string;
  concurrency?: number;
}

export function startWorker(options: StartWorkerOptions = {}): Worker<MediaJobData, MediaJobResult> {
  const redisUrl = options.redisUrl ?? process.env.REDIS_URL;
  if (!redisUrl) {
    throw new Error('REDIS_URL is required to start the media worker');
  }

  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
  const media = new MediaService();

  const worker = new Worker<MediaJobData, MediaJobResult>(
    MEDIA_INGEST_QUEUE,
    async (job: Job<MediaJobData>) => processMediaJob(job.data, { media }),
    {
      connection,
      concurrency: options.concurrency ?? 2,
    },
  );

  worker.on('completed', (job) => {
    console.log(`[media-worker] job ${job.id} completed`);
  });
  worker.on('failed', (job, err) => {
    console.error(`[media-worker] job ${job?.id} failed:`, err.message);
  });

  console.log(`[media-worker] listening on queue "${MEDIA_INGEST_QUEUE}"`);
  return worker;
}

/** Try Redis; if unavailable return null so callers can fall back to processMediaJob. */
export async function tryStartWorker(
  options: StartWorkerOptions = {},
): Promise<Worker<MediaJobData, MediaJobResult> | null> {
  const redisUrl = options.redisUrl ?? process.env.REDIS_URL;
  if (!redisUrl) return null;

  try {
    const redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
      lazyConnect: true,
    });
    await redis.connect();
    await redis.ping();
    await redis.quit();
    return startWorker(options);
  } catch (err) {
    console.warn(
      '[media-worker] Redis unavailable, use processMediaJob in-process:',
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

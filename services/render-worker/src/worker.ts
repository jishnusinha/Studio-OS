import { promises as fs } from 'node:fs';
import { createWriteStream } from 'node:fs';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import type { Timeline } from '@studio-os/contracts';
import { exportOtio, exportEdl } from './otio-export.js';
import { renderTimeline, type RenderPreset, type RenderResult } from './renderer.js';

export const RENDER_QUEUE = 'render';

export interface RenderS3Config {
  bucket: string;
  endpoint?: string;
  region?: string;
  forcePathStyle?: boolean;
  accessKeyId: string;
  secretAccessKey: string;
}

export interface RenderJobData {
  deliverableId?: string;
  timelineId: string;
  projectId: string;
  timeline: Timeline;
  /** Local paths OR S3 keys (when s3 config present, values are treated as keys until downloaded). */
  assetPathMap: Record<string, string>;
  outputPath?: string;
  preset?: RenderPreset | string;
  exportOtio?: boolean;
  s3?: RenderS3Config;
}

export interface RenderJobResult extends RenderResult {
  deliverableId?: string;
  timelineId: string;
  projectId: string;
  otioPath?: string;
  edlTextPath?: string;
  storageKey?: string;
}

export interface ProcessRenderJobOptions {
  workDir?: string;
}

async function downloadFromS3(
  s3: RenderS3Config,
  key: string,
  destPath: string,
): Promise<void> {
  const { S3Client, GetObjectCommand } = await import('@aws-sdk/client-s3');
  const client = new S3Client({
    region: s3.region ?? 'us-east-1',
    endpoint: s3.endpoint,
    forcePathStyle: s3.forcePathStyle ?? true,
    credentials: {
      accessKeyId: s3.accessKeyId,
      secretAccessKey: s3.secretAccessKey,
    },
  });
  const res = await client.send(new GetObjectCommand({ Bucket: s3.bucket, Key: key }));
  if (!res.Body) throw new Error(`Empty S3 body for ${key}`);
  await pipeline(res.Body as Readable, createWriteStream(destPath));
}

async function uploadToS3(
  s3: RenderS3Config,
  key: string,
  filePath: string,
  contentType: string,
): Promise<void> {
  const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
  const client = new S3Client({
    region: s3.region ?? 'us-east-1',
    endpoint: s3.endpoint,
    forcePathStyle: s3.forcePathStyle ?? true,
    credentials: {
      accessKeyId: s3.accessKeyId,
      secretAccessKey: s3.secretAccessKey,
    },
  });
  const body = await fs.readFile(filePath);
  await client.send(
    new PutObjectCommand({
      Bucket: s3.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

export async function processRenderJob(
  data: RenderJobData,
  options: ProcessRenderJobOptions = {},
): Promise<RenderJobResult> {
  const workDir =
    options.workDir ?? join(process.cwd(), '.tmp', 'render', data.timelineId);
  await fs.mkdir(workDir, { recursive: true });

  let assetPathMap = { ...data.assetPathMap };

  // Download masters from MinIO/S3 when credentials provided and paths look like keys
  if (data.s3) {
    const localMap: Record<string, string> = {};
    for (const [assetId, keyOrPath] of Object.entries(data.assetPathMap)) {
      const looksLocal =
        keyOrPath.includes('\\') ||
        keyOrPath.startsWith('/') ||
        /^[A-Za-z]:/.test(keyOrPath);
      if (looksLocal) {
        localMap[assetId] = keyOrPath;
        continue;
      }
      const dest = join(workDir, `asset-${assetId}`);
      try {
        await downloadFromS3(data.s3, keyOrPath, dest);
        localMap[assetId] = dest;
      } catch (err) {
        console.warn(
          `[render-worker] download failed asset=${assetId}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }
    assetPathMap = localMap;
  }

  const outputPath =
    data.outputPath ?? join(workDir, `master-${data.preset ?? 'master'}.mp4`);

  const result = await renderTimeline(data.timeline, {
    assetPathMap,
    outputPath,
    preset: data.preset,
  });

  let otioPath: string | undefined;
  let edlTextPath: string | undefined;
  if (data.exportOtio !== false) {
    otioPath = join(workDir, 'timeline.otio.json');
    const otio = exportOtio(data.timeline);
    await fs.writeFile(otioPath, JSON.stringify(otio, null, 2), 'utf8');
    edlTextPath = join(workDir, 'timeline.edl');
    await fs.writeFile(edlTextPath, exportEdl(data.timeline), 'utf8');
  }

  let storageKey: string | undefined;
  if (data.s3 && data.deliverableId) {
    storageKey = `projects/${data.projectId}/deliverables/${data.deliverableId}/master.mp4`;
    try {
      await uploadToS3(
        data.s3,
        storageKey,
        result.outputPath,
        result.mock ? 'text/plain' : 'video/mp4',
      );
    } catch (err) {
      console.warn(
        '[render-worker] upload failed:',
        err instanceof Error ? err.message : err,
      );
    }
  }

  const jobResult: RenderJobResult = {
    ...result,
    deliverableId: data.deliverableId,
    timelineId: data.timelineId,
    projectId: data.projectId,
    otioPath,
    edlTextPath,
    storageKey,
  };

  console.log(
    '[render-worker] processed',
    JSON.stringify({
      timelineId: jobResult.timelineId,
      outputPath: jobResult.outputPath,
      mock: jobResult.mock,
      storageKey: jobResult.storageKey,
      edlPath: jobResult.edlPath,
    }),
  );

  return jobResult;
}

export interface StartRenderWorkerOptions {
  redisUrl?: string;
  concurrency?: number;
}

export function startWorker(
  options: StartRenderWorkerOptions = {},
): Worker<RenderJobData, RenderJobResult> {
  const redisUrl = options.redisUrl ?? process.env.REDIS_URL;
  if (!redisUrl) {
    throw new Error('REDIS_URL is required to start the render worker');
  }

  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });

  const worker = new Worker<RenderJobData, RenderJobResult>(
    RENDER_QUEUE,
    async (job: Job<RenderJobData>) => processRenderJob(job.data),
    {
      connection,
      concurrency: options.concurrency ?? 1,
    },
  );

  worker.on('completed', (job) => {
    console.log(`[render-worker] job ${job.id} completed`);
  });
  worker.on('failed', (job, err) => {
    console.error(`[render-worker] job ${job?.id} failed:`, err.message);
  });

  console.log(`[render-worker] listening on queue "${RENDER_QUEUE}"`);
  return worker;
}

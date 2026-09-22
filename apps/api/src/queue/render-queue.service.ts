import { Inject, Injectable, Logger, OnModuleDestroy, Optional } from '@nestjs/common';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { Env } from '@studio-os/contracts';
import type { Timeline } from '@studio-os/contracts';
import { deliverables, type Database } from '@studio-os/db';
import { Queue } from 'bullmq';
import { eq } from 'drizzle-orm';
import { createWriteStream, promises as fs } from 'node:fs';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { Redis } from 'ioredis';
import { ENV } from '../config/env.js';
import { DB } from '../db/db.tokens.js';

export const RENDER_QUEUE = 'render';

export interface RenderEnqueuePayload {
  deliverableId: string;
  timelineId: string;
  projectId: string;
  timeline: Timeline;
  /** assetId → S3 storage key (master/source) */
  assetKeyMap: Record<string, string>;
  preset: string;
}

@Injectable()
export class RenderQueueService implements OnModuleDestroy {
  private readonly logger = new Logger(RenderQueueService.name);
  private readonly queue: Queue | null;
  private readonly connection: Redis | null;
  private readonly s3: S3Client;

  constructor(
    @Inject(ENV) private readonly env: Env,
    @Optional() @Inject(DB) private readonly db?: Database,
  ) {
    this.s3 = new S3Client({
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY,
        secretAccessKey: env.S3_SECRET_KEY,
      },
    });

    if (env.REDIS_URL) {
      this.connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
      this.queue = new Queue(RENDER_QUEUE, {
        connection: this.connection.duplicate(),
      });
      this.logger.log(`BullMQ queue "${RENDER_QUEUE}" ready`);
    } else {
      this.connection = null;
      this.queue = null;
      this.logger.log('REDIS_URL unset — render will run in-process when possible');
    }
  }

  async enqueue(job: RenderEnqueuePayload): Promise<void> {
    // Always complete in-process so deliverable status/storageKey are persisted.
    // Also mirror onto BullMQ when Redis is available for dedicated workers.
    if (this.queue) {
      await this.queue.add(
        'render',
        {
          deliverableId: job.deliverableId,
          timelineId: job.timelineId,
          projectId: job.projectId,
          timeline: job.timeline,
          assetPathMap: job.assetKeyMap,
          preset: job.preset,
          s3: {
            bucket: this.env.S3_BUCKET,
            endpoint: this.env.S3_ENDPOINT,
            region: this.env.S3_REGION,
            forcePathStyle: this.env.S3_FORCE_PATH_STYLE,
            accessKeyId: this.env.S3_ACCESS_KEY,
            secretAccessKey: this.env.S3_SECRET_KEY,
          },
        },
        { removeOnComplete: 50, removeOnFail: 25 },
      );
      this.logger.log(`Enqueued render deliverable=${job.deliverableId}`);
    }

    await this.runInProcess(job);
  }

  private async runInProcess(job: RenderEnqueuePayload): Promise<void> {
    const workDir = join(process.cwd(), '.tmp', 'render', job.timelineId);
    await fs.mkdir(workDir, { recursive: true });

    const assetPathMap: Record<string, string> = {};
    for (const [assetId, key] of Object.entries(job.assetKeyMap)) {
      const localPath = join(workDir, `asset-${assetId}`);
      try {
        await this.downloadObject(key, localPath);
        assetPathMap[assetId] = localPath;
      } catch (err) {
        this.logger.warn(
          `Failed to download asset ${assetId} (${key}): ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    let result: {
      outputPath: string;
      mock?: boolean;
      edlPath?: string;
    };

    try {
      const mod = await import('@studio-os/render-worker');
      result = await mod.processRenderJob({
        deliverableId: job.deliverableId,
        timelineId: job.timelineId,
        projectId: job.projectId,
        timeline: job.timeline,
        assetPathMap,
        preset: job.preset,
        outputPath: join(workDir, `master-${job.preset}.mp4`),
      });
    } catch (err) {
      this.logger.warn(
        `render-worker unavailable, writing stub: ${err instanceof Error ? err.message : err}`,
      );
      const stubPath = join(workDir, `master-${job.preset}.mp4`);
      await fs.writeFile(stubPath, `StudioOS render stub\ntimeline=${job.timelineId}\n`, 'utf8');
      result = { outputPath: stubPath, mock: true };
    }

    const storageKey = `projects/${job.projectId}/deliverables/${job.deliverableId}/master.mp4`;
    try {
      const body = await fs.readFile(result.outputPath);
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.env.S3_BUCKET,
          Key: storageKey,
          Body: body,
          ContentType: result.mock ? 'text/plain' : 'video/mp4',
        }),
      );
    } catch (err) {
      this.logger.warn(
        `Failed to upload deliverable: ${err instanceof Error ? err.message : err}`,
      );
    }

    if (this.db) {
      await this.db
        .update(deliverables)
        .set({
          status: 'ready',
          metadata: {
            timelineId: job.timelineId,
            storageKey,
            preset: job.preset,
            mock: result.mock ?? false,
            edlPath: result.edlPath,
          },
        })
        .where(eq(deliverables.id, job.deliverableId));
    }

    this.logger.log(`Render complete deliverable=${job.deliverableId} key=${storageKey}`);
  }

  private async downloadObject(key: string, destPath: string): Promise<void> {
    const res = await this.s3.send(
      new GetObjectCommand({ Bucket: this.env.S3_BUCKET, Key: key }),
    );
    if (!res.Body) throw new Error(`Empty body for ${key}`);
    const body = res.Body as Readable;
    await pipeline(body, createWriteStream(destPath));
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue?.close();
    if (this.connection) await this.connection.quit();
  }
}

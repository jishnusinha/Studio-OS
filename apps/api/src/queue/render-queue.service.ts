import { Inject, Injectable, Logger, OnModuleDestroy, Optional } from '@nestjs/common';
import type { Env } from '@studio-os/contracts';
import type { Timeline } from '@studio-os/contracts';
import { deliverables, type Database } from '@studio-os/db';
import type { StorageBackend } from '@studio-os/storage';
import { Queue } from 'bullmq';
import { eq } from 'drizzle-orm';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { Redis } from 'ioredis';
import { ENV } from '../config/env.js';
import { DB } from '../db/db.tokens.js';
import { STORAGE } from '../storage/storage.module.js';

export const RENDER_QUEUE = 'render';

export interface RenderEnqueuePayload {
  deliverableId: string;
  timelineId: string;
  projectId: string;
  timeline: Timeline;
  /** assetId → storage key (master/source) */
  assetKeyMap: Record<string, string>;
  preset: string;
}

@Injectable()
export class RenderQueueService implements OnModuleDestroy {
  private readonly logger = new Logger(RenderQueueService.name);
  private readonly queue: Queue | null;
  private readonly connection: Redis | null;

  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(STORAGE) private readonly storage: StorageBackend,
    @Optional() @Inject(DB) private readonly db?: Database,
  ) {
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
    if (this.queue) {
      const payload: Record<string, unknown> = {
        deliverableId: job.deliverableId,
        timelineId: job.timelineId,
        projectId: job.projectId,
        timeline: job.timeline,
        assetPathMap: job.assetKeyMap,
        preset: job.preset,
        storageBackend: this.storage.kind,
      };
      if (this.storage.kind === 's3' && this.env.S3_BUCKET) {
        payload.s3 = {
          bucket: this.env.S3_BUCKET,
          endpoint: this.env.S3_ENDPOINT,
          region: this.env.S3_REGION,
          forcePathStyle: this.env.S3_FORCE_PATH_STYLE,
          accessKeyId: this.env.S3_ACCESS_KEY,
          secretAccessKey: this.env.S3_SECRET_KEY,
        };
      }
      if (this.storage.kind === 'local') {
        payload.localMediaRoot = this.env.LOCAL_MEDIA_ROOT;
      }
      await this.queue.add('render', payload, { removeOnComplete: 50, removeOnFail: 25 });
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
        const direct = this.storage.localPath?.(key);
        if (direct) {
          assetPathMap[assetId] = direct;
        } else {
          await this.storage.materialize(key, localPath);
          assetPathMap[assetId] = localPath;
        }
      } catch (err) {
        this.logger.warn(
          `Failed to materialize asset ${assetId} (${key}): ${err instanceof Error ? err.message : err}`,
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
      await this.storage.put(storageKey, body, result.mock ? 'text/plain' : 'video/mp4');
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

  async onModuleDestroy(): Promise<void> {
    await this.queue?.close();
    if (this.connection) await this.connection.quit();
  }
}

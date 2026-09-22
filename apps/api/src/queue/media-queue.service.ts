import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import type { Env } from '@studio-os/contracts';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { ENV } from '../config/env.js';

export const MEDIA_INGEST_QUEUE = 'media-ingest';

export interface MediaIngestPayload {
  assetId: string;
  storageKey: string;
  projectId: string;
}

@Injectable()
export class MediaQueueService implements OnModuleDestroy {
  private readonly logger = new Logger(MediaQueueService.name);
  private readonly queue: Queue | null;
  private readonly connection: Redis | null;
  private readonly redisUrl: string | undefined;

  constructor(@Inject(ENV) env: Env) {
    this.redisUrl = env.REDIS_URL;
    if (this.redisUrl) {
      this.connection = new Redis(this.redisUrl, { maxRetriesPerRequest: null });
      this.queue = new Queue(MEDIA_INGEST_QUEUE, {
        connection: this.connection.duplicate(),
      });
      this.logger.log(`BullMQ queue "${MEDIA_INGEST_QUEUE}" ready`);
    } else {
      this.connection = null;
      this.queue = null;
      this.logger.log('REDIS_URL unset — media-ingest will run in-process when possible');
    }
  }

  async enqueue(job: MediaIngestPayload): Promise<void> {
    if (this.queue) {
      await this.queue.add('ingest', job, {
        removeOnComplete: 100,
        removeOnFail: 50,
      });
      this.logger.log(`Enqueued media-ingest asset=${job.assetId}`);
      return;
    }

    // In-process fallback via dynamic import to avoid hard circular deps at boot
    try {
      const mod = await import('@studio-os/media-worker');
      await mod.processMediaJob(job);
      this.logger.log(`In-process media-ingest completed asset=${job.assetId}`);
    } catch (err) {
      this.logger.warn(
        `media-ingest deferred (no Redis / media-worker unavailable) asset=${job.assetId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue?.close();
    if (this.connection) {
      await this.connection.quit();
    }
  }
}

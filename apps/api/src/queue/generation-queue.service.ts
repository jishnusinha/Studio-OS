import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { S3Client } from '@aws-sdk/client-s3';
import type { Env } from '@studio-os/contracts';
import type { Database } from '@studio-os/db';
import {
  createWorkflowEngine,
  GENERATION_QUEUE,
  APPROVAL_SIGNAL,
  runGenerationWorkflow,
  type WorkflowEngine,
} from '@studio-os/workflow';
import { ENV } from '../config/env.js';
import { DB } from '../db/db.tokens.js';
import { MediaQueueService } from './media-queue.service.js';
import { GatewayFactory } from '../generation/gateway.factory.js';

export { GENERATION_QUEUE, APPROVAL_SIGNAL };

@Injectable()
export class GenerationQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GenerationQueueService.name);
  private readonly engine: WorkflowEngine;
  private readonly s3: S3Client;

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    @Inject(GatewayFactory) private readonly gatewayFactory: GatewayFactory,
    @Inject(MediaQueueService) private readonly mediaQueue: MediaQueueService,
  ) {
    this.engine = createWorkflowEngine({
      redisUrl: env.REDIS_URL,
      temporalAddress: process.env.TEMPORAL_ADDRESS,
      temporalNamespace: process.env.TEMPORAL_NAMESPACE,
    });
    this.s3 = new S3Client({
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY,
        secretAccessKey: env.S3_SECRET_KEY,
      },
    });
  }

  onModuleInit(): void {
    // When no dedicated generation-worker is consuming, process locally via the engine.
    // With REDIS_URL the worker usually consumes; API still registers for InProcess fallback.
    const hasDedicatedWorker = Boolean(process.env.GENERATION_WORKER_EXTERNAL);
    if (!hasDedicatedWorker) {
      this.engine.process(GENERATION_QUEUE, async (data) => {
        const jobId =
          typeof data === 'object' && data && 'jobId' in data
            ? String((data as { jobId: string }).jobId)
            : null;
        if (!jobId) throw new Error('generation job payload missing jobId');
        await this.runJob(jobId);
        return { ok: true };
      });
      this.logger.log(`GenerationQueueService processing "${GENERATION_QUEUE}" locally`);
    } else {
      this.logger.log(
        `GENERATION_WORKER_EXTERNAL set — API only enqueues to "${GENERATION_QUEUE}"`,
      );
    }
  }

  async enqueue(jobId: string, opts?: { priority?: number }): Promise<string> {
    const engineJobId = await this.engine.enqueue(
      GENERATION_QUEUE,
      'runGeneration',
      { jobId },
      { priority: opts?.priority, workflowId: `gen-${jobId}` },
    );
    this.logger.log(`Enqueued generation job=${jobId} engineId=${engineJobId}`);
    return engineJobId;
  }

  async signalApproval(jobId: string, payload?: unknown): Promise<void> {
    if (this.engine.signal) {
      await this.engine.signal(`gen-${jobId}`, APPROVAL_SIGNAL, payload);
    }
  }

  async runJob(jobId: string): Promise<void> {
    await runGenerationWorkflow(jobId, {
      db: this.db,
      gateway: this.gatewayFactory.get(),
      s3: this.s3,
      env: this.env,
      enqueueMediaIngest: (job) => this.mediaQueue.enqueue(job),
      logger: {
        log: (msg) => this.logger.log(msg),
        error: (msg, stack) => this.logger.error(msg, stack),
      },
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.engine.close?.();
  }
}

import { Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import { parseEnv } from '@studio-os/contracts';
import { createDb } from '@studio-os/db';
import { AiGateway, ModelRouter, type ModelDescriptor, type PricingRule } from '@studio-os/gateway';
import { createProviderRegistry } from '@studio-os/providers';
import {
  BullMQWorkflowEngine,
  InProcessWorkflowEngine,
  createWorkflowEngine,
  type WorkflowEngine,
} from '@studio-os/workflow';
import { S3Client } from '@aws-sdk/client-s3';
import {
  runGenerationJob,
  type GenerationDeps,
  type GenerationJobData,
} from './generation-handler.js';

export const GENERATION_QUEUE = 'generation';

const DEFAULT_MODELS: ModelDescriptor[] = [
  {
    id: 'mock-llm',
    providerId: 'mock-llm',
    capabilities: ['text.generate'],
    published: true,
    costWeight: 1,
  },
  {
    id: 'mock-image',
    providerId: 'mock-image',
    capabilities: ['image.generate', 'image.edit', 'image.upscale'],
    published: true,
    costWeight: 1,
  },
  {
    id: 'mock-video',
    providerId: 'mock-video',
    capabilities: ['video.generate', 'video.edit', 'video.upscale'],
    published: true,
    costWeight: 2,
  },
  {
    id: 'mock-voice',
    providerId: 'mock-voice',
    capabilities: ['voice.tts', 'voice.stt', 'voice.clone'],
    published: true,
    costWeight: 1,
  },
  {
    id: 'mock-music',
    providerId: 'mock-music',
    capabilities: ['music.generate', 'sfx.generate'],
    published: true,
    costWeight: 1,
  },
  {
    id: 'mock-embed',
    providerId: 'mock-embed',
    capabilities: ['text.embed'],
    published: true,
    costWeight: 1,
  },
];

export function createDefaultGateway(): AiGateway {
  const registry = createProviderRegistry(true);
  const pricing: PricingRule[] = [
    { modelId: 'mock-image', providerId: 'mock-image', unit: 'image', rateUsd: 0.02 },
    { modelId: 'mock-video', providerId: 'mock-video', unit: 'second', rateUsd: 0.05 },
    { modelId: 'mock-llm', providerId: 'mock-llm', unit: 'output_token', rateUsd: 0.00001 },
  ];
  const router = new ModelRouter(DEFAULT_MODELS, pricing);
  return new AiGateway(registry, router, pricing);
}

export interface StartGenerationWorkerOptions {
  redisUrl?: string;
  concurrency?: number;
  deps?: Partial<GenerationDeps>;
  gateway?: AiGateway;
}

export function startWorker(options: StartGenerationWorkerOptions = {}): Worker {
  const redisUrl = options.redisUrl ?? process.env.REDIS_URL;
  if (!redisUrl) {
    throw new Error('REDIS_URL is required to start the generation worker');
  }

  const gateway = options.gateway ?? createDefaultGateway();
  const env = options.deps?.env ?? parseEnv(process.env);
  const db = options.deps?.db ?? createDb(env.DATABASE_URL);
  const s3 =
    options.deps?.s3 ??
    new S3Client({
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY,
        secretAccessKey: env.S3_SECRET_KEY,
      },
    });

  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });

  const worker = new Worker(
    GENERATION_QUEUE,
    async (job: Job<GenerationJobData | { jobId: string }>) => {
      const deps: GenerationDeps = {
        gateway,
        db,
        env,
        s3,
        ...options.deps,
      };
      return runGenerationJob(job.data as GenerationJobData, deps);
    },
    {
      connection,
      concurrency: options.concurrency ?? 2,
    },
  );

  worker.on('completed', (job) => {
    console.log(`[generation-worker] job ${job.id} completed`);
  });
  worker.on('failed', (job, err) => {
    console.error(`[generation-worker] job ${job?.id} failed:`, err.message);
  });

  console.log(`[generation-worker] listening on queue "${GENERATION_QUEUE}"`);
  return worker;
}

/** Create a workflow engine wired to runGenerationJob on the generation queue. */
export function wireGenerationEngine(engine: WorkflowEngine, deps: GenerationDeps): void {
  engine.process(GENERATION_QUEUE, async (data) => {
    return runGenerationJob(data as GenerationJobData, deps);
  });
}

export function createInProcessEngine(deps: GenerationDeps): InProcessWorkflowEngine {
  const engine = new InProcessWorkflowEngine();
  wireGenerationEngine(engine, deps);
  return engine;
}

export function createBullMQEngine(redisUrl: string, deps: GenerationDeps): BullMQWorkflowEngine {
  const engine = new BullMQWorkflowEngine({ redisUrl });
  wireGenerationEngine(engine, deps);
  return engine;
}

export { createWorkflowEngine, InProcessWorkflowEngine, BullMQWorkflowEngine, type WorkflowEngine };

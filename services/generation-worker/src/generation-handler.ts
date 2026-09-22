import type { Env } from '@studio-os/contracts';
import { createDb, type Database } from '@studio-os/db';
import type { AiGateway } from '@studio-os/gateway';
import {
  runGenerationWorkflow,
  WORKFLOW_STEPS,
  type GenerationWorkflowDeps,
  type MediaIngestJob,
  type WorkflowStepName,
} from '@studio-os/workflow';
import { S3Client } from '@aws-sdk/client-s3';
import { parseEnv } from '@studio-os/contracts';

/** @deprecated Prefer WORKFLOW_STEPS from @studio-os/workflow */
export const GENERATION_STEPS = WORKFLOW_STEPS;
export type GenerationStepName = WorkflowStepName;

export interface GenerationJobData {
  jobId: string;
  /** Optional fields retained for backward-compatible queue payloads. */
  workspaceId?: string;
  projectId?: string;
  userId?: string;
  request?: unknown;
}

export interface GenerationDeps {
  gateway: AiGateway;
  db?: Database;
  env?: Env;
  s3?: S3Client;
  enqueueMediaIngest?: (job: MediaIngestJob) => Promise<void>;
  onStep?: (step: {
    name: string;
    status: string;
    output?: Record<string, unknown>;
    error?: string;
  }) => Promise<void> | void;
  pollIntervalMs?: number;
  maxPollAttempts?: number;
}

function createS3FromEnv(env: Env): S3Client {
  return new S3Client({
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY,
      secretAccessKey: env.S3_SECRET_KEY,
    },
  });
}

function resolveEnv(deps: GenerationDeps): Env {
  if (deps.env) return deps.env;
  return parseEnv(process.env);
}

function resolveDb(deps: GenerationDeps, env: Env): Database {
  if (deps.db) return deps.db;
  return createDb(env.DATABASE_URL);
}

/**
 * Run the shared DB-backed generation workflow for a job id.
 * Queue payloads may be `{ jobId }` or a legacy GenerationJobData object.
 */
export async function runGenerationJob(
  jobData: GenerationJobData | string,
  deps: GenerationDeps,
): Promise<{ jobId: string; status: 'completed' }> {
  const jobId = typeof jobData === 'string' ? jobData : jobData.jobId;
  const env = resolveEnv(deps);
  const db = resolveDb(deps, env);
  const s3 = deps.s3 ?? createS3FromEnv(env);

  const workflowDeps: GenerationWorkflowDeps = {
    db,
    gateway: deps.gateway,
    s3,
    env,
    enqueueMediaIngest: deps.enqueueMediaIngest,
    pollIntervalMs: deps.pollIntervalMs,
    maxPollAttempts: deps.maxPollAttempts,
    logger: {
      log: (msg) => {
        console.log(`[generation-worker] ${msg}`);
        void deps.onStep?.({ name: 'notify', status: 'log', output: { msg } });
      },
      error: (msg, stack) => console.error(`[generation-worker] ${msg}`, stack),
    },
  };

  await runGenerationWorkflow(jobId, workflowDeps);
  return { jobId, status: 'completed' };
}

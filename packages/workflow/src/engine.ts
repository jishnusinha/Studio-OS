import { Queue, Worker, type JobsOptions } from 'bullmq';
import { Redis } from 'ioredis';

export interface WorkflowEngine {
  enqueue(
    queue: string,
    name: string,
    data: unknown,
    opts?: { priority?: number; workflowId?: string },
  ): Promise<string>;
  process(queue: string, handler: (data: unknown) => Promise<unknown>): void;
  /** Optional graceful shutdown */
  close?(): Promise<void>;
  /** Signal a paused/awaiting workflow (Temporal). No-op for in-process/BullMQ. */
  signal?(workflowId: string, signalName: string, payload?: unknown): Promise<void>;
}

export class InProcessWorkflowEngine implements WorkflowEngine {
  private readonly handlers = new Map<string, (data: unknown) => Promise<unknown>>();
  private readonly pending = new Map<string, { queue: string; name: string; data: unknown }>();
  private readonly awaiting = new Map<
    string,
    { resolve: (payload?: unknown) => void; signalName: string }
  >();

  async enqueue(
    queue: string,
    name: string,
    data: unknown,
    opts?: { priority?: number; workflowId?: string },
  ): Promise<string> {
    const id = opts?.workflowId ?? crypto.randomUUID();
    this.pending.set(id, { queue, name, data });
    setImmediate(() => {
      void this.dispatch(id);
    });
    return id;
  }

  process(queue: string, handler: (data: unknown) => Promise<unknown>): void {
    this.handlers.set(queue, handler);
  }

  async signal(workflowId: string, signalName: string, payload?: unknown): Promise<void> {
    const waiter = this.awaiting.get(workflowId);
    if (waiter && waiter.signalName === signalName) {
      this.awaiting.delete(workflowId);
      waiter.resolve(payload);
    }
  }

  /** Used by Temporal-shaped activity helpers when running in-process. */
  waitForSignal(workflowId: string, signalName: string): Promise<unknown> {
    return new Promise((resolve) => {
      this.awaiting.set(workflowId, { resolve, signalName });
    });
  }

  private async dispatch(id: string): Promise<void> {
    const job = this.pending.get(id);
    if (!job) return;
    this.pending.delete(id);

    const handler = this.handlers.get(job.queue);
    if (!handler) {
      console.warn(`[InProcessWorkflowEngine] no handler for queue "${job.queue}"`);
      return;
    }

    try {
      await handler(job.data);
    } catch (err) {
      console.error(`[InProcessWorkflowEngine] queue "${job.queue}" failed:`, err);
    }
  }
}

export interface BullMQWorkflowEngineOptions {
  redisUrl: string;
  concurrency?: number;
}

export class BullMQWorkflowEngine implements WorkflowEngine {
  private readonly connection: Redis;
  private readonly queues = new Map<string, Queue>();
  private readonly workers: Worker[] = [];
  private readonly concurrency: number;

  constructor(options: BullMQWorkflowEngineOptions) {
    this.connection = new Redis(options.redisUrl, { maxRetriesPerRequest: null });
    this.concurrency = options.concurrency ?? 2;
  }

  private getQueue(queue: string): Queue {
    let q = this.queues.get(queue);
    if (!q) {
      q = new Queue(queue, { connection: this.connection.duplicate() });
      this.queues.set(queue, q);
    }
    return q;
  }

  async enqueue(
    queue: string,
    name: string,
    data: unknown,
    opts?: { priority?: number; workflowId?: string },
  ): Promise<string> {
    const q = this.getQueue(queue);
    const jobOpts: JobsOptions = {};
    if (opts?.priority != null) jobOpts.priority = opts.priority;
    if (opts?.workflowId) jobOpts.jobId = opts.workflowId;
    const job = await q.add(name, data, jobOpts);
    return String(job.id);
  }

  process(queue: string, handler: (data: unknown) => Promise<unknown>): void {
    const worker = new Worker(queue, async (job) => handler(job.data), {
      connection: this.connection.duplicate(),
      concurrency: this.concurrency,
    });
    worker.on('failed', (job, err) => {
      console.error(`[BullMQWorkflowEngine] ${queue} job ${job?.id} failed:`, err.message);
    });
    this.workers.push(worker);
  }

  async signal(_workflowId: string, _signalName: string, _payload?: unknown): Promise<void> {
    // BullMQ jobs don't pause for signals; approval resumes by re-enqueueing externally.
  }

  async close(): Promise<void> {
    await Promise.all(this.workers.map((w) => w.close()));
    await Promise.all([...this.queues.values()].map((q) => q.close()));
    await this.connection.quit();
  }
}

/**
 * Temporal-shaped engine. Uses @temporalio/client when installed and TEMPORAL_ADDRESS is set.
 * Falls back to InProcessWorkflowEngine behavior if the SDK is unavailable so local DX stays green.
 */
export class TemporalWorkflowEngine implements WorkflowEngine {
  private readonly address: string;
  private readonly namespace: string;
  private readonly fallback: InProcessWorkflowEngine;
  private client: {
    workflow: {
      start: (
        name: string,
        opts: { taskQueue: string; workflowId: string; args: unknown[] },
      ) => Promise<{ workflowId: string }>;
      getHandle: (id: string) => { signal: (name: string, ...args: unknown[]) => Promise<void> };
    };
  } | null = null;
  private initPromise: Promise<void> | null = null;

  constructor(options: { address: string; namespace?: string }) {
    this.address = options.address;
    this.namespace = options.namespace ?? 'default';
    this.fallback = new InProcessWorkflowEngine();
  }

  private async ensureClient(): Promise<void> {
    if (this.client) return;
    if (this.initPromise) return this.initPromise;
    this.initPromise = (async () => {
      try {
        // Dynamic import — package is optional until Temporal is deployed
        const temporal = await import('@temporalio/client' as string).catch(() => null);
        if (!temporal) {
          console.warn(
            '[TemporalWorkflowEngine] @temporalio/client not installed — using in-process fallback',
          );
          return;
        }
        const connection = await temporal.Connection.connect({ address: this.address });
        this.client = new temporal.Client({ connection, namespace: this.namespace });
        console.log(`[TemporalWorkflowEngine] connected to ${this.address}`);
      } catch (err) {
        console.warn(
          `[TemporalWorkflowEngine] connect failed (${err instanceof Error ? err.message : err}) — in-process fallback`,
        );
      }
    })();
    return this.initPromise;
  }

  async enqueue(
    queue: string,
    name: string,
    data: unknown,
    opts?: { priority?: number; workflowId?: string },
  ): Promise<string> {
    await this.ensureClient();
    const workflowId =
      opts?.workflowId ??
      (typeof data === 'object' && data && 'jobId' in data
        ? `gen-${(data as { jobId: string }).jobId}`
        : crypto.randomUUID());

    if (!this.client) {
      return this.fallback.enqueue(queue, name, data, { ...opts, workflowId });
    }

    await this.client.workflow.start(name, {
      taskQueue: queue,
      workflowId,
      args: [data],
    });
    return workflowId;
  }

  process(queue: string, handler: (data: unknown) => Promise<unknown>): void {
    // Temporal workers register activities separately; keep in-process handler for fallback mode.
    this.fallback.process(queue, handler);
  }

  async signal(workflowId: string, signalName: string, payload?: unknown): Promise<void> {
    await this.ensureClient();
    if (!this.client) {
      await this.fallback.signal(workflowId, signalName, payload);
      return;
    }
    const handle = this.client.workflow.getHandle(workflowId);
    await handle.signal(signalName, payload);
  }

  async close(): Promise<void> {
    // Temporal Connection lifecycle managed by process
  }
}

export interface CreateWorkflowEngineOptions {
  redisUrl?: string;
  temporalAddress?: string;
  temporalNamespace?: string;
}

/** Prefer Temporal when TEMPORAL_ADDRESS is set, else BullMQ when REDIS_URL, else in-process. */
export function createWorkflowEngine(
  redisUrlOrOpts?: string | CreateWorkflowEngineOptions,
): WorkflowEngine {
  const opts: CreateWorkflowEngineOptions =
    typeof redisUrlOrOpts === 'string'
      ? { redisUrl: redisUrlOrOpts }
      : (redisUrlOrOpts ?? {});

  const temporalAddress = opts.temporalAddress ?? process.env.TEMPORAL_ADDRESS;
  if (temporalAddress) {
    return new TemporalWorkflowEngine({
      address: temporalAddress,
      namespace: opts.temporalNamespace ?? process.env.TEMPORAL_NAMESPACE ?? 'default',
    });
  }

  const url = opts.redisUrl ?? process.env.REDIS_URL;
  if (url) {
    return new BullMQWorkflowEngine({ redisUrl: url });
  }
  return new InProcessWorkflowEngine();
}

export const GENERATION_QUEUE = 'generation';
export const APPROVAL_SIGNAL = 'approve_generation';

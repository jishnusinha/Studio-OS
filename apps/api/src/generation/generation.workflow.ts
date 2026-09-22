import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import {
  WORKFLOW_STEPS,
  type WorkflowStepName,
} from '@studio-os/workflow';
import { GenerationQueueService } from '../queue/generation-queue.service.js';

export { WORKFLOW_STEPS, type WorkflowStepName };

@Injectable()
export class GenerationWorkflow {
  private readonly logger = new Logger(GenerationWorkflow.name);

  constructor(
    @Optional() @Inject(GenerationQueueService) private readonly queue?: GenerationQueueService,
  ) {}

  /** Enqueue via WorkflowEngine (InProcess / BullMQ / Temporal). */
  enqueue(jobId: string): void {
    if (!this.queue) {
      this.logger.error(`No GenerationQueueService — cannot run job ${jobId}`);
      return;
    }
    void this.queue.enqueue(jobId).catch((err) => {
      this.logger.error(
        `Failed to enqueue job ${jobId}`,
        err instanceof Error ? err.stack : String(err),
      );
    });
  }

  async run(jobId: string): Promise<void> {
    if (!this.queue) throw new Error('GenerationQueueService unavailable');
    await this.queue.runJob(jobId);
  }
}

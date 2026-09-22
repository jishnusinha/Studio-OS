import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CapabilityRequestSchema, type BrandDna } from '@studio-os/contracts';
import {
  brands,
  generationJobSteps,
  generationJobs,
  type Database,
} from '@studio-os/db';
import { desc, eq } from 'drizzle-orm';
import { DB } from '../db/db.tokens.js';
import { assertNoForbiddenClaims } from '../commercial/claims.validator.js';
import { GatewayFactory } from './gateway.factory.js';
import { GenerationWorkflow, WORKFLOW_STEPS } from './generation.workflow.js';

@Injectable()
export class GenerationService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(GatewayFactory) private readonly gatewayFactory: GatewayFactory,
    @Inject(GenerationWorkflow) private readonly workflow: GenerationWorkflow,
  ) {}

  private async assertClaims(projectId: string, prompt?: string) {
    const [brand] = await this.db
      .select()
      .from(brands)
      .where(eq(brands.projectId, projectId))
      .limit(1);
    if (!brand) return;
    assertNoForbiddenClaims(prompt, brand.dna as BrandDna);
  }

  async estimate(body: unknown) {
    const parsed = CapabilityRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    const req = parsed.data;
    await this.assertClaims(req.projectId, req.intent.prompt);
    const gateway = this.gatewayFactory.get();
    return gateway.estimate({
      capability: req.capability,
      modelId: req.constraints.modelId,
      providerId: req.constraints.providerId,
      prompt: req.intent.prompt,
      parameters: {
        ...req.intent.parameters,
        duration: req.intent.shotDna?.durationSec,
        durationSec: req.intent.shotDna?.durationSec,
      },
      qualityMode: req.constraints.qualityMode,
      constraints: req.constraints,
    });
  }

  async generate(userId: string, body: unknown) {
    const parsed = CapabilityRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    const req = parsed.data;
    await this.assertClaims(req.projectId, req.intent.prompt);

    const [job] = await this.db
      .insert(generationJobs)
      .values({
        workspaceId: req.workspaceId,
        projectId: req.projectId,
        userId,
        shotId: req.shotId ?? null,
        capability: req.capability,
        status: 'queued',
        progress: 0,
        request: req as unknown as Record<string, unknown>,
      })
      .returning();

    if (!job) throw new BadRequestException('Failed to create job');

    await this.db.insert(generationJobSteps).values(
      WORKFLOW_STEPS.map((name, index) => ({
        jobId: job.id,
        name,
        status: 'pending',
        sortOrder: index,
      })),
    );

    this.workflow.enqueue(job.id);
    return job;
  }

  async listJobs(projectId?: string) {
    if (projectId) {
      return this.db
        .select()
        .from(generationJobs)
        .where(eq(generationJobs.projectId, projectId))
        .orderBy(desc(generationJobs.createdAt));
    }
    return this.db.select().from(generationJobs).orderBy(desc(generationJobs.createdAt)).limit(100);
  }

  async getJob(id: string) {
    const [job] = await this.db
      .select()
      .from(generationJobs)
      .where(eq(generationJobs.id, id))
      .limit(1);
    if (!job) throw new NotFoundException('Job not found');
    const steps = await this.db
      .select()
      .from(generationJobSteps)
      .where(eq(generationJobSteps.jobId, id));
    return { ...job, steps };
  }

  async cancelJob(id: string) {
    const [job] = await this.db
      .select()
      .from(generationJobs)
      .where(eq(generationJobs.id, id))
      .limit(1);
    if (!job) throw new NotFoundException('Job not found');
    if (job.status === 'completed' || job.status === 'failed') {
      return job;
    }
    const [updated] = await this.db
      .update(generationJobs)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(eq(generationJobs.id, id))
      .returning();
    return updated;
  }

  async retryJob(id: string) {
    const [job] = await this.db
      .select()
      .from(generationJobs)
      .where(eq(generationJobs.id, id))
      .limit(1);
    if (!job) throw new NotFoundException('Job not found');
    if (!['failed', 'cancelled'].includes(job.status)) {
      throw new BadRequestException('Only failed or cancelled jobs can be retried');
    }

    const [updated] = await this.db
      .update(generationJobs)
      .set({
        status: 'queued',
        progress: 0,
        error: null,
        updatedAt: new Date(),
        completedAt: null,
      })
      .where(eq(generationJobs.id, id))
      .returning();

    if (!updated) throw new BadRequestException('Failed to retry job');

    await this.db
      .update(generationJobSteps)
      .set({ status: 'pending', error: null, startedAt: null, completedAt: null, output: {} })
      .where(eq(generationJobSteps.jobId, id));

    this.workflow.enqueue(updated.id);
    return updated;
  }

  async reprioritizeJob(id: string, priority: number) {
    if (!Number.isFinite(priority)) {
      throw new BadRequestException('priority must be a number');
    }
    const [job] = await this.db
      .select()
      .from(generationJobs)
      .where(eq(generationJobs.id, id))
      .limit(1);
    if (!job) throw new NotFoundException('Job not found');
    const [updated] = await this.db
      .update(generationJobs)
      .set({ priority: Math.trunc(priority), updatedAt: new Date() })
      .where(eq(generationJobs.id, id))
      .returning();
    return updated;
  }
}

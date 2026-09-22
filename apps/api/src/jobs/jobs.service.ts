import { ForbiddenException, Inject, Injectable, MessageEvent } from '@nestjs/common';
import { generationJobs, projectMembers, type Database } from '@studio-os/db';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { Observable } from 'rxjs';
import { DB } from '../db/db.tokens.js';
import { GenerationService } from '../generation/generation.service.js';

@Injectable()
export class JobsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(GenerationService) private readonly generation: GenerationService,
  ) {}

  async listForUser(userId: string, projectId?: string) {
    if (projectId) {
      return this.generation.listJobs(projectId);
    }
    const memberships = await this.db
      .select({ projectId: projectMembers.projectId })
      .from(projectMembers)
      .where(eq(projectMembers.userId, userId));
    const ids = memberships.map((m) => m.projectId);
    if (ids.length === 0) return [];
    return this.db
      .select()
      .from(generationJobs)
      .where(inArray(generationJobs.projectId, ids))
      .orderBy(desc(generationJobs.createdAt))
      .limit(100);
  }

  get(id: string) {
    return this.generation.getJob(id);
  }

  cancel(id: string) {
    return this.generation.cancelJob(id);
  }

  retry(id: string) {
    return this.generation.retryJob(id);
  }

  reprioritize(id: string, priority: number) {
    return this.generation.reprioritizeJob(id, priority);
  }

  streamProjectJobs(projectId: string): Observable<MessageEvent> {
    return new Observable((subscriber) => {
      let stopped = false;

      const tick = async () => {
        while (!stopped) {
          try {
            const jobs = await this.db
              .select({
                id: generationJobs.id,
                projectId: generationJobs.projectId,
                status: generationJobs.status,
                progress: generationJobs.progress,
                priority: generationJobs.priority,
                capability: generationJobs.capability,
                modelId: generationJobs.modelId,
                providerId: generationJobs.providerId,
                error: generationJobs.error,
                estimatedCostUsd: generationJobs.estimatedCostUsd,
                actualCostUsd: generationJobs.actualCostUsd,
                createdAt: generationJobs.createdAt,
                updatedAt: generationJobs.updatedAt,
              })
              .from(generationJobs)
              .where(eq(generationJobs.projectId, projectId))
              .orderBy(desc(generationJobs.updatedAt))
              .limit(50);

            subscriber.next({
              data: JSON.stringify({ jobs, at: new Date().toISOString() }),
            } as MessageEvent);
          } catch (err) {
            subscriber.error(err);
            return;
          }
          await new Promise((r) => setTimeout(r, 1000));
        }
      };

      void tick();

      return () => {
        stopped = true;
      };
    });
  }

  async assertMember(projectId: string, userId: string) {
    const [member] = await this.db
      .select()
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
      .limit(1);
    if (!member) throw new ForbiddenException('Not a project member');
    return member;
  }
}

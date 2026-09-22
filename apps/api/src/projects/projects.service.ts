import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateProjectRequestSchema } from '@studio-os/contracts';
import { projectMembers, projects, type Database } from '@studio-os/db';
import { eq } from 'drizzle-orm';
import { DB } from '../db/db.tokens.js';

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);
  return base || 'project';
}

@Injectable()
export class ProjectsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async listByWorkspace(workspaceId: string) {
    return this.db.select().from(projects).where(eq(projects.workspaceId, workspaceId));
  }

  async getById(id: string) {
    const [project] = await this.db.select().from(projects).where(eq(projects.id, id)).limit(1);
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  async create(userId: string, body: unknown) {
    const parsed = CreateProjectRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    const data = parsed.data;
    const slug = `${slugify(data.name)}-${Date.now().toString(36)}`;

    const [project] = await this.db
      .insert(projects)
      .values({
        workspaceId: data.workspaceId,
        name: data.name,
        slug,
        type: data.type,
        description: data.description ?? null,
        budgetUsd: data.budgetUsd != null ? String(data.budgetUsd) : null,
      })
      .returning();

    if (!project) throw new BadRequestException('Failed to create project');

    await this.db.insert(projectMembers).values({
      projectId: project.id,
      userId,
      role: 'owner',
    });

    return project;
  }
}

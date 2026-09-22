import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { styles, type Database } from '@studio-os/db';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { DB } from '../db/db.tokens.js';

const StyleCreateSchema = z.object({
  name: z.string().min(1).max(200),
  dna: z.record(z.unknown()).default({}),
});

const StyleUpdateSchema = StyleCreateSchema.partial();

@Injectable()
export class StylesService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async list(projectId: string) {
    return this.db.select().from(styles).where(eq(styles.projectId, projectId));
  }

  async get(id: string) {
    const [row] = await this.db.select().from(styles).where(eq(styles.id, id)).limit(1);
    if (!row) throw new NotFoundException('Style not found');
    return row;
  }

  async create(projectId: string, body: unknown) {
    const parsed = StyleCreateSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());

    const [row] = await this.db
      .insert(styles)
      .values({
        projectId,
        name: parsed.data.name,
        dna: parsed.data.dna ?? {},
      })
      .returning();

    if (!row) throw new BadRequestException('Failed to create style');
    return row;
  }

  async update(id: string, body: unknown) {
    const parsed = StyleUpdateSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const data = parsed.data;

    const [existing] = await this.db.select().from(styles).where(eq(styles.id, id)).limit(1);
    if (!existing) throw new NotFoundException('Style not found');

    const [updated] = await this.db
      .update(styles)
      .set({
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.dna !== undefined
          ? { dna: { ...(existing.dna as Record<string, unknown>), ...data.dna } }
          : {}),
      })
      .where(eq(styles.id, id))
      .returning();

    return updated;
  }

  async remove(id: string) {
    const [deleted] = await this.db.delete(styles).where(eq(styles.id, id)).returning();
    if (!deleted) throw new NotFoundException('Style not found');
    return { ok: true, id };
  }
}

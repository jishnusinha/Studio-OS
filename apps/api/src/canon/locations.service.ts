import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { locations, type Database } from '@studio-os/db';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { DB } from '../db/db.tokens.js';

const LocationCreateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  dna: z.record(z.unknown()).optional(),
  referenceImageIds: z.array(z.string().uuid()).optional(),
  status: z.string().optional(),
  locked: z.boolean().optional(),
});

const LocationUpdateSchema = LocationCreateSchema.partial();

function mapLocationRow(row: typeof locations.$inferSelect) {
  const dna = (row.dna ?? {}) as Record<string, unknown>;
  return {
    ...row,
    referenceImageIds: (dna.referenceImageIds as string[] | undefined) ?? [],
  };
}

@Injectable()
export class LocationsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async list(projectId: string) {
    const rows = await this.db.select().from(locations).where(eq(locations.projectId, projectId));
    return rows.map(mapLocationRow);
  }

  async get(id: string) {
    const [row] = await this.db.select().from(locations).where(eq(locations.id, id)).limit(1);
    if (!row) throw new NotFoundException('Location not found');
    return mapLocationRow(row);
  }

  async create(projectId: string, body: unknown) {
    const parsed = LocationCreateSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const data = parsed.data;

    const [row] = await this.db
      .insert(locations)
      .values({
        projectId,
        name: data.name,
        description: data.description ?? null,
        dna: {
          ...(data.dna ?? {}),
          ...(data.referenceImageIds ? { referenceImageIds: data.referenceImageIds } : {}),
        },
        status: data.status ?? 'draft',
        locked: data.locked ?? false,
      })
      .returning();

    if (!row) throw new BadRequestException('Failed to create location');
    return mapLocationRow(row);
  }

  async update(id: string, body: unknown) {
    const parsed = LocationUpdateSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const data = parsed.data;

    const [existing] = await this.db
      .select()
      .from(locations)
      .where(eq(locations.id, id))
      .limit(1);
    if (!existing) throw new NotFoundException('Location not found');

    const dna = {
      ...(existing.dna as Record<string, unknown>),
      ...(data.dna ?? {}),
      ...(data.referenceImageIds !== undefined
        ? { referenceImageIds: data.referenceImageIds }
        : {}),
    };

    const [updated] = await this.db
      .update(locations)
      .set({
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        dna,
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.locked !== undefined ? { locked: data.locked } : {}),
        updatedAt: new Date(),
      })
      .where(eq(locations.id, id))
      .returning();

    return mapLocationRow(updated!);
  }

  async remove(id: string) {
    const [deleted] = await this.db.delete(locations).where(eq(locations.id, id)).returning();
    if (!deleted) throw new NotFoundException('Location not found');
    return { ok: true, id };
  }
}

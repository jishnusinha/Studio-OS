import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { products, type Database } from '@studio-os/db';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { DB } from '../db/db.tokens.js';

const ProductCreateSchema = z.object({
  name: z.string().min(1).max(200),
  brandId: z.string().uuid().optional(),
  packshots: z.array(z.unknown()).optional(),
  claims: z.array(z.string()).optional(),
  properties: z.record(z.unknown()).optional(),
  status: z.string().optional(),
});

const ProductUpdateSchema = ProductCreateSchema.partial();

function mapProductRow(row: typeof products.$inferSelect) {
  const properties = (row.properties ?? {}) as Record<string, unknown>;
  return {
    ...row,
    packshots: (properties.packshots as unknown[] | undefined) ?? [],
    claims: (properties.claims as string[] | undefined) ?? [],
  };
}

@Injectable()
export class ProductsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async list(projectId: string) {
    const rows = await this.db.select().from(products).where(eq(products.projectId, projectId));
    return rows.map(mapProductRow);
  }

  async get(id: string) {
    const [row] = await this.db.select().from(products).where(eq(products.id, id)).limit(1);
    if (!row) throw new NotFoundException('Product not found');
    return mapProductRow(row);
  }

  async create(projectId: string, body: unknown) {
    const parsed = ProductCreateSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const data = parsed.data;

    const [row] = await this.db
      .insert(products)
      .values({
        projectId,
        brandId: data.brandId ?? null,
        name: data.name,
        properties: {
          ...(data.properties ?? {}),
          packshots: data.packshots ?? [],
          claims: data.claims ?? [],
        },
        status: data.status ?? 'draft',
      })
      .returning();

    if (!row) throw new BadRequestException('Failed to create product');
    return mapProductRow(row);
  }

  async update(id: string, body: unknown) {
    const parsed = ProductUpdateSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const data = parsed.data;

    const [existing] = await this.db
      .select()
      .from(products)
      .where(eq(products.id, id))
      .limit(1);
    if (!existing) throw new NotFoundException('Product not found');

    const properties = {
      ...(existing.properties as Record<string, unknown>),
      ...(data.properties ?? {}),
      ...(data.packshots !== undefined ? { packshots: data.packshots } : {}),
      ...(data.claims !== undefined ? { claims: data.claims } : {}),
    };

    const [updated] = await this.db
      .update(products)
      .set({
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.brandId !== undefined ? { brandId: data.brandId } : {}),
        properties,
        ...(data.status !== undefined ? { status: data.status } : {}),
        version: existing.version + 1,
      })
      .where(eq(products.id, id))
      .returning();

    return mapProductRow(updated!);
  }

  async remove(id: string) {
    const [deleted] = await this.db.delete(products).where(eq(products.id, id)).returning();
    if (!deleted) throw new NotFoundException('Product not found');
    return { ok: true, id };
  }
}

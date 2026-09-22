import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CreatePackshotRequestSchema,
  CreateProductRequestSchema,
  UpdateProductRequestSchema,
} from '@studio-os/contracts';
import { packshots, products, type Database } from '@studio-os/db';
import { asc, eq } from 'drizzle-orm';
import { DB } from '../db/db.tokens.js';

@Injectable()
export class ProductsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async list(projectId: string) {
    const rows = await this.db
      .select()
      .from(products)
      .where(eq(products.projectId, projectId))
      .orderBy(asc(products.name));

    const shots = await this.db
      .select()
      .from(packshots)
      .where(eq(packshots.projectId, projectId))
      .orderBy(asc(packshots.sortOrder));

    return rows.map((p) => ({
      ...p,
      packshots: shots.filter((s) => s.productId === p.id),
    }));
  }

  async create(projectId: string, body: unknown) {
    const parsed = CreateProductRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const [row] = await this.db
      .insert(products)
      .values({
        projectId,
        name: parsed.data.name,
        brandId: parsed.data.brandId ?? null,
        properties: parsed.data.properties ?? {},
      })
      .returning();
    if (!row) throw new BadRequestException('Failed to create product');
    return { ...row, packshots: [] as unknown[] };
  }

  async update(productId: string, body: unknown) {
    const parsed = UpdateProductRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const [existing] = await this.db
      .select()
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);
    if (!existing) throw new NotFoundException('Product not found');

    const [row] = await this.db
      .update(products)
      .set({
        name: parsed.data.name ?? existing.name,
        brandId:
          parsed.data.brandId === undefined ? existing.brandId : parsed.data.brandId,
        properties: parsed.data.properties ?? existing.properties,
        status: parsed.data.status ?? existing.status,
        version: existing.version + 1,
      })
      .where(eq(products.id, productId))
      .returning();
    return row;
  }

  async remove(productId: string) {
    const [row] = await this.db
      .delete(products)
      .where(eq(products.id, productId))
      .returning();
    if (!row) throw new NotFoundException('Product not found');
    return { ok: true, id: productId };
  }

  async addPackshot(productId: string, body: unknown) {
    const parsed = CreatePackshotRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    if (!parsed.data.url && !parsed.data.assetId) {
      throw new BadRequestException('url or assetId is required');
    }

    const [product] = await this.db
      .select()
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);
    if (!product) throw new NotFoundException('Product not found');

    const [row] = await this.db
      .insert(packshots)
      .values({
        projectId: product.projectId,
        productId,
        url: parsed.data.url ?? null,
        assetId: parsed.data.assetId ?? null,
        label: parsed.data.label ?? 'Packshot',
        sortOrder: parsed.data.sortOrder ?? 0,
        metadata: parsed.data.metadata ?? {},
      })
      .returning();
    if (!row) throw new BadRequestException('Failed to create packshot');
    return row;
  }

  async removePackshot(packshotId: string) {
    const [row] = await this.db
      .delete(packshots)
      .where(eq(packshots.id, packshotId))
      .returning();
    if (!row) throw new NotFoundException('Packshot not found');
    return { ok: true, id: packshotId };
  }

  async listPackshots(productId: string) {
    return this.db
      .select()
      .from(packshots)
      .where(eq(packshots.productId, productId))
      .orderBy(asc(packshots.sortOrder));
  }
}

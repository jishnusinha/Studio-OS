import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  modelCapabilities,
  models,
  providers,
  type Database,
} from '@studio-os/db';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { DB } from '../db/db.tokens.js';
import { GatewayFactory } from '../generation/gateway.factory.js';

const CreateModelSchema = z.object({
  id: z.string().min(1).max(120),
  providerId: z.string().min(1).max(80),
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  parameterSchema: z.record(z.unknown()).optional(),
  capabilities: z.array(z.string()).optional(),
  published: z.boolean().optional(),
});

@Injectable()
export class ModelsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(GatewayFactory) private readonly gatewayFactory: GatewayFactory,
  ) {}

  async listPublished() {
    const rows = await this.db.select().from(models).where(eq(models.published, true));
    const caps = await this.db.select().from(modelCapabilities);
    const byModel = new Map<string, string[]>();
    for (const c of caps) {
      const list = byModel.get(c.modelId) ?? [];
      list.push(c.capabilityId);
      byModel.set(c.modelId, list);
    }

    return rows.map((m) => ({
      id: m.id,
      providerId: m.providerId,
      name: m.name,
      description: m.description,
      published: m.published,
      deprecated: m.deprecated,
      parameterSchema: m.parameterSchema,
      capabilities: byModel.get(m.id) ?? [],
    }));
  }

  async listAll() {
    const rows = await this.db.select().from(models);
    const caps = await this.db.select().from(modelCapabilities);
    const byModel = new Map<string, string[]>();
    for (const c of caps) {
      const list = byModel.get(c.modelId) ?? [];
      list.push(c.capabilityId);
      byModel.set(c.modelId, list);
    }
    return rows.map((m) => ({
      id: m.id,
      providerId: m.providerId,
      name: m.name,
      description: m.description,
      published: m.published,
      deprecated: m.deprecated,
      parameterSchema: m.parameterSchema,
      capabilities: byModel.get(m.id) ?? [],
    }));
  }

  async getById(id: string) {
    const [model] = await this.db.select().from(models).where(eq(models.id, id)).limit(1);
    if (!model) throw new NotFoundException('Model not found');

    const caps = await this.db
      .select()
      .from(modelCapabilities)
      .where(eq(modelCapabilities.modelId, id));

    return {
      ...model,
      capabilities: caps.map((c) => c.capabilityId),
    };
  }

  async create(body: unknown) {
    const parsed = CreateModelSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const data = parsed.data;

    const [provider] = await this.db
      .select()
      .from(providers)
      .where(eq(providers.id, data.providerId))
      .limit(1);
    if (!provider) throw new BadRequestException(`Unknown provider: ${data.providerId}`);

    const [existing] = await this.db.select().from(models).where(eq(models.id, data.id)).limit(1);
    if (existing) throw new BadRequestException('Model id already exists');

    const [created] = await this.db
      .insert(models)
      .values({
        id: data.id,
        providerId: data.providerId,
        name: data.name,
        description: data.description ?? null,
        published: data.published ?? false,
        parameterSchema: (data.parameterSchema ?? {}) as Record<string, unknown>,
      })
      .returning();

    if (!created) throw new BadRequestException('Failed to create model');

    for (const cap of data.capabilities ?? []) {
      await this.db
        .insert(modelCapabilities)
        .values({ modelId: created.id, capabilityId: cap })
        .onConflictDoNothing();
    }

    await this.gatewayFactory.rebuild();
    return this.getById(created.id);
  }

  async testConnection(id: string) {
    const model = await this.getById(id);
    const [provider] = await this.db
      .select()
      .from(providers)
      .where(eq(providers.id, model.providerId))
      .limit(1);
    if (!provider) {
      return { ok: false, providerId: model.providerId, message: 'Provider missing' };
    }
    if (!provider.enabled) {
      return { ok: false, providerId: provider.id, message: 'Provider disabled' };
    }
    return {
      ok: true,
      providerId: provider.id,
      message: `Connected to ${provider.name} (${provider.kind})`,
    };
  }

  async testGeneration(id: string, body: unknown) {
    const model = await this.getById(id);
    const prompt =
      typeof body === 'object' && body && 'prompt' in body
        ? String((body as { prompt?: string }).prompt ?? 'StudioOS connection test')
        : 'StudioOS connection test';

    const capability =
      model.capabilities.find((c) => c === 'text.generate') ??
      model.capabilities.find((c) => c.endsWith('.generate')) ??
      model.capabilities[0];

    if (!capability) {
      return { ok: false, error: 'Model has no capabilities' };
    }

    try {
      const gateway = this.gatewayFactory.get();
      if (capability === 'text.generate') {
        const result = await gateway.execute({
          capability: 'text.generate',
          prompt,
          constraints: { modelId: model.id, providerId: model.providerId },
          qualityMode: 'draft',
          maxPollAttempts: 40,
        });
        return { ok: true, text: result.text.slice(0, 500), modelId: result.modelId };
      }

      const estimate = gateway.estimate({
        capability: capability as 'image.generate',
        modelId: model.id,
        providerId: model.providerId,
        prompt,
        qualityMode: 'draft',
      });
      return {
        ok: true,
        text: `Estimate ok for ${capability}: $${estimate.minUsd}–$${estimate.maxUsd}`,
        modelId: estimate.modelId,
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  async publish(id: string, published = true) {
    const [updated] = await this.db
      .update(models)
      .set({ published })
      .where(eq(models.id, id))
      .returning();
    if (!updated) throw new NotFoundException('Model not found');
    await this.gatewayFactory.rebuild();
    return this.getById(id);
  }
}

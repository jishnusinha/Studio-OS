import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import type { Env } from '@studio-os/contracts';
import {
  inferenceEndpoints,
  modelCapabilities,
  models,
  pricingRules,
  providers,
  type Database,
} from '@studio-os/db';
import { AiGateway, ModelRouter, type ModelDescriptor, type PricingRule } from '@studio-os/gateway';
import { createProviderRegistry, registerSelfHostedProvider } from '@studio-os/providers';
import { eq } from 'drizzle-orm';
import { ENV } from '../config/env.js';
import { DB } from '../db/db.tokens.js';

@Injectable()
export class GatewayFactory implements OnModuleInit {
  private gateway!: AiGateway;
  private healthySelfHostedProviderIds: string[] = [];

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async onModuleInit() {
    this.gateway = await this.build();
  }

  get(): AiGateway {
    return this.gateway;
  }

  getHealthySelfHostedProviderIds(): string[] {
    return this.healthySelfHostedProviderIds;
  }

  async rebuild(): Promise<AiGateway> {
    this.gateway = await this.build();
    return this.gateway;
  }

  private async build(): Promise<AiGateway> {
    const modelRows = await this.db.select().from(models).where(eq(models.published, true));
    const capRows = await this.db.select().from(modelCapabilities);
    const capsByModel = new Map<string, string[]>();
    for (const row of capRows) {
      const list = capsByModel.get(row.modelId) ?? [];
      list.push(row.capabilityId);
      capsByModel.set(row.modelId, list);
    }

    const descriptors: ModelDescriptor[] = modelRows.map((m) => ({
      id: m.id,
      providerId: m.providerId,
      capabilities: capsByModel.get(m.id) ?? [],
      published: m.published,
    }));

    const ruleRows = await this.db.select().from(pricingRules);
    const rules: PricingRule[] = ruleRows.map((r) => ({
      modelId: r.modelId,
      providerId: r.providerId,
      unit: r.unit,
      rateUsd: Number(r.rateUsd),
      qualityMode: r.quality ?? undefined,
    }));

    // createProviderRegistry already registers per-model adapters + `mock` dispatcher
    const registry = createProviderRegistry(this.env.USE_MOCK_PROVIDERS);

    // Register self-hosted providers when configured (kind='self-hosted' + endpoint URL).
    const providerRows = await this.db.select().from(providers).where(eq(providers.enabled, true));
    const endpoints = await this.db
      .select()
      .from(inferenceEndpoints)
      .where(eq(inferenceEndpoints.enabled, true));

    this.healthySelfHostedProviderIds = [];
    for (const p of providerRows) {
      if (p.kind !== 'self-hosted') continue;
      const cfg = (p.config ?? {}) as Record<string, unknown>;
      const endpoint =
        endpoints.find((e) => e.id === cfg.endpointId) ??
        endpoints.find((e) => e.healthy) ??
        endpoints[0];
      const baseUrl =
        (typeof cfg.baseUrl === 'string' && cfg.baseUrl) || endpoint?.baseUrl || null;
      if (!baseUrl) continue;

      registerSelfHostedProvider(registry, {
        providerId: p.id,
        baseUrl,
        apiKey: typeof cfg.apiKey === 'string' ? cfg.apiKey : undefined,
        kind:
          (endpoint?.kind as 'openai-compatible' | 'comfyui' | undefined) ??
          (cfg.kind as 'openai-compatible' | 'comfyui' | undefined),
      });

      if (endpoint?.healthy !== false) {
        this.healthySelfHostedProviderIds.push(p.id);
      }
    }

    const router = new ModelRouter(descriptors, rules);
    return new AiGateway(registry, router, rules);
  }
}

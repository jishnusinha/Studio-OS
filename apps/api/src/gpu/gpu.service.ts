import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  gpuNodePools,
  gpuNodes,
  inferenceEndpoints,
  modelWeightDeployments,
  modelWeights,
  providers,
  type Database,
} from '@studio-os/db';
import { checkSelfHostedHealth, type SelfHostedKind } from '@studio-os/providers';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { DB } from '../db/db.tokens.js';
import { GatewayFactory } from '../generation/gateway.factory.js';

const CreateEndpointSchema = z.object({
  name: z.string().min(1),
  baseUrl: z.string().url(),
  kind: z.enum(['openai-compatible', 'comfyui']).default('openai-compatible'),
  apiKey: z.string().optional(),
  enabled: z.boolean().optional(),
  registerProvider: z.boolean().optional(),
  providerId: z.string().optional(),
});

const CreatePoolSchema = z.object({
  name: z.string().min(1),
  region: z.string().optional(),
  maxNodes: z.number().int().positive().optional(),
});

@Injectable()
export class GpuService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(GatewayFactory) private readonly gatewayFactory: GatewayFactory,
  ) {}

  async listEndpoints() {
    const rows = await this.db.select().from(inferenceEndpoints);
    return { endpoints: rows };
  }

  async createEndpoint(body: unknown) {
    const input = CreateEndpointSchema.parse(body);
    const [endpoint] = await this.db
      .insert(inferenceEndpoints)
      .values({
        name: input.name,
        baseUrl: input.baseUrl,
        kind: input.kind,
        authConfig: input.apiKey ? { apiKey: input.apiKey } : {},
        enabled: input.enabled !== false,
        healthy: false,
      })
      .returning();

    if (input.registerProvider !== false) {
      const providerId = input.providerId ?? `self-hosted-${endpoint!.id.slice(0, 8)}`;
      const [existing] = await this.db
        .select()
        .from(providers)
        .where(eq(providers.id, providerId))
        .limit(1);
      if (!existing) {
        await this.db.insert(providers).values({
          id: providerId,
          name: input.name,
          kind: 'self-hosted',
          enabled: true,
          config: {
            endpointId: endpoint!.id,
            baseUrl: input.baseUrl,
            kind: input.kind,
            apiKey: input.apiKey,
          },
        });
      }
    }

    await this.gatewayFactory.rebuild();
    return endpoint;
  }

  async healthCheck(endpointId: string) {
    const [endpoint] = await this.db
      .select()
      .from(inferenceEndpoints)
      .where(eq(inferenceEndpoints.id, endpointId))
      .limit(1);
    if (!endpoint) throw new NotFoundException('Endpoint not found');

    const apiKey =
      typeof (endpoint.authConfig as Record<string, unknown>)?.apiKey === 'string'
        ? ((endpoint.authConfig as Record<string, unknown>).apiKey as string)
        : undefined;

    const result = await checkSelfHostedHealth(
      endpoint.baseUrl,
      endpoint.kind as SelfHostedKind,
      apiKey,
    );

    const [updated] = await this.db
      .update(inferenceEndpoints)
      .set({
        healthy: result.ok,
        lastHealthAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(inferenceEndpoints.id, endpointId))
      .returning();

    if (result.ok) {
      await this.gatewayFactory.rebuild();
    }

    return { endpoint: updated, health: result };
  }

  async listPools() {
    const pools = await this.db.select().from(gpuNodePools);
    const nodes = await this.db.select().from(gpuNodes);
    return { pools, nodes };
  }

  async createPool(body: unknown) {
    const input = CreatePoolSchema.parse(body);
    const [pool] = await this.db
      .insert(gpuNodePools)
      .values({
        name: input.name,
        region: input.region,
        maxNodes: input.maxNodes ?? 1,
      })
      .returning();
    return pool;
  }

  async listWeights() {
    const weights = await this.db.select().from(modelWeights);
    const deployments = await this.db.select().from(modelWeightDeployments);
    return { weights, deployments };
  }

  async createWeight(body: unknown) {
    const schema = z.object({
      name: z.string().min(1),
      modelId: z.string().optional(),
      format: z.string().optional(),
      storageUri: z.string().optional(),
      checksum: z.string().optional(),
    });
    const input = schema.parse(body);
    const [weight] = await this.db
      .insert(modelWeights)
      .values({
        name: input.name,
        modelId: input.modelId,
        format: input.format ?? 'safetensors',
        storageUri: input.storageUri,
        checksum: input.checksum,
      })
      .returning();
    return weight;
  }

  async deployWeight(body: unknown) {
    const schema = z.object({
      weightId: z.string().uuid(),
      endpointId: z.string().uuid(),
      nodeId: z.string().uuid().optional(),
    });
    const input = schema.parse(body);
    const [deployment] = await this.db
      .insert(modelWeightDeployments)
      .values({
        weightId: input.weightId,
        endpointId: input.endpointId,
        nodeId: input.nodeId,
        status: 'deployed',
        deployedAt: new Date(),
      })
      .returning();
    return deployment;
  }
}

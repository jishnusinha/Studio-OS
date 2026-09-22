import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  adapters,
  datasetItems,
  datasets,
  fineTunes,
  models,
  modelCapabilities,
  providers,
  trainingCheckpoints,
  trainingMetrics,
  trainingRuns,
  type Database,
} from '@studio-os/db';
import { and, asc, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { DB } from '../db/db.tokens.js';

const ConsentSchema = z.object({
  granted: z.boolean().optional(),
  rightsCleared: z.boolean().optional(),
  note: z.string().optional(),
}).passthrough();

const CreateDatasetSchema = z.object({
  name: z.string().min(1).max(200),
  type: z.string().min(1).max(60).default('image'),
  consent: ConsentSchema.optional(),
  rights: z.record(z.unknown()).optional(),
});

const AddDatasetItemSchema = z.object({
  assetId: z.string().uuid(),
  caption: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const LaunchFineTuneSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  datasetId: z.string().uuid(),
  type: z.string().min(1).max(60).default('lora'),
  config: z.record(z.unknown()).optional(),
  baseModel: z.string().optional(),
  rank: z.number().int().positive().optional(),
});

const AppendMetricsSchema = z.object({
  metrics: z
    .array(
      z.object({
        step: z.number().int().nonnegative().optional(),
        name: z.string().min(1),
        value: z.number(),
        metadata: z.record(z.unknown()).optional(),
      }),
    )
    .min(1),
});

const PromoteAdapterSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  providerId: z.string().optional(),
  publish: z.boolean().optional(),
});

function consentGranted(consent: Record<string, unknown>): boolean {
  return consent.granted === true || consent.rightsCleared === true;
}

function estimateCostUsd(itemCount: number, type: string, rank: number): number {
  const base = type === 'lora' ? 0.15 : 0.4;
  const perItem = type === 'lora' ? 0.02 : 0.05;
  const rankFactor = 1 + Math.log2(Math.max(rank, 2)) / 8;
  return Math.round((base + itemCount * perItem) * rankFactor * 10000) / 10000;
}

@Injectable()
export class TrainingService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async listDatasets(projectId: string) {
    return this.db
      .select()
      .from(datasets)
      .where(eq(datasets.projectId, projectId))
      .orderBy(desc(datasets.createdAt));
  }

  async createDataset(projectId: string, body: unknown) {
    const parsed = CreateDatasetSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const consent = (parsed.data.consent ?? {}) as Record<string, unknown>;
    if (!consentGranted(consent)) {
      throw new BadRequestException(
        'Consent gating: set consent.granted or consent.rightsCleared to true before creating a dataset',
      );
    }
    const [row] = await this.db
      .insert(datasets)
      .values({
        projectId,
        name: parsed.data.name,
        type: parsed.data.type,
        consent,
        rights: (parsed.data.rights ?? {}) as Record<string, unknown>,
      })
      .returning();
    return row;
  }

  async getDataset(id: string) {
    const [row] = await this.db.select().from(datasets).where(eq(datasets.id, id)).limit(1);
    if (!row) throw new NotFoundException('Dataset not found');
    const items = await this.db
      .select()
      .from(datasetItems)
      .where(eq(datasetItems.datasetId, id));
    return { ...row, items };
  }

  async addDatasetItem(datasetId: string, body: unknown) {
    const [ds] = await this.db.select().from(datasets).where(eq(datasets.id, datasetId)).limit(1);
    if (!ds) throw new NotFoundException('Dataset not found');
    if (!consentGranted(ds.consent as Record<string, unknown>)) {
      throw new BadRequestException('Consent gating: dataset consent not granted');
    }
    const parsed = AddDatasetItemSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const [row] = await this.db
      .insert(datasetItems)
      .values({
        datasetId,
        assetId: parsed.data.assetId,
        caption: parsed.data.caption,
        metadata: (parsed.data.metadata ?? {}) as Record<string, unknown>,
      })
      .returning();
    return row;
  }

  async listRuns(projectId: string) {
    return this.db
      .select()
      .from(trainingRuns)
      .where(eq(trainingRuns.projectId, projectId))
      .orderBy(desc(trainingRuns.createdAt));
  }

  async listFineTunes(projectId: string) {
    return this.db
      .select()
      .from(fineTunes)
      .where(eq(fineTunes.projectId, projectId))
      .orderBy(desc(fineTunes.createdAt));
  }

  async launchFineTune(projectId: string, body: unknown, userId?: string) {
    const parsed = LaunchFineTuneSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());

    const [ds] = await this.db
      .select()
      .from(datasets)
      .where(and(eq(datasets.id, parsed.data.datasetId), eq(datasets.projectId, projectId)))
      .limit(1);
    if (!ds) throw new NotFoundException('Dataset not found');
    if (!consentGranted(ds.consent as Record<string, unknown>)) {
      throw new BadRequestException('Consent gating: dataset consent not granted');
    }

    const items = await this.db
      .select()
      .from(datasetItems)
      .where(eq(datasetItems.datasetId, ds.id));
    // Allow empty datasets for drafting; cost still estimated from item count (min 1 slot).
    const itemCount = Math.max(items.length, 1);

    const rank = parsed.data.rank ?? 16;
    const baseModel = parsed.data.baseModel ?? 'mock-base';
    const cost = estimateCostUsd(itemCount, parsed.data.type, rank);
    const config = {
      ...(parsed.data.config ?? {}),
      rank,
      baseModel,
      itemCount: items.length,
    };

    const [ft] = await this.db
      .insert(fineTunes)
      .values({
        projectId,
        datasetId: ds.id,
        type: parsed.data.type,
        config,
        status: 'running',
        costEstimateUsd: String(cost),
        createdBy: userId,
      })
      .returning();

    const [run] = await this.db
      .insert(trainingRuns)
      .values({
        projectId,
        fineTuneId: ft!.id,
        datasetId: ds.id,
        name: parsed.data.name ?? `${parsed.data.type}-${ds.name}`,
        status: 'running',
        config,
        costEstimateUsd: String(cost),
        createdBy: userId,
        startedAt: new Date(),
      })
      .returning();

    // Seed a first checkpoint + adapter stub for the hub promote flow
    await this.db.insert(trainingCheckpoints).values({
      runId: run!.id,
      step: 0,
      label: 'init',
      storageKey: `training/${run!.id}/ckpt-0`,
      metrics: { loss: 1 },
    });

    const [adapter] = await this.db
      .insert(adapters)
      .values({
        projectId,
        runId: run!.id,
        name: `${run!.name}-lora`,
        rank,
        baseModel,
        storageKey: `adapters/${run!.id}/lora`,
        status: 'training',
        config: { fineTuneId: ft!.id },
      })
      .returning();

    return {
      fineTune: ft,
      run,
      adapter,
      costEstimateUsd: cost,
    };
  }

  async getRun(id: string) {
    const [run] = await this.db.select().from(trainingRuns).where(eq(trainingRuns.id, id)).limit(1);
    if (!run) throw new NotFoundException('Training run not found');
    const [checkpoints, metrics, adapterRows] = await Promise.all([
      this.db
        .select()
        .from(trainingCheckpoints)
        .where(eq(trainingCheckpoints.runId, id))
        .orderBy(asc(trainingCheckpoints.step)),
      this.db
        .select()
        .from(trainingMetrics)
        .where(eq(trainingMetrics.runId, id))
        .orderBy(asc(trainingMetrics.step)),
      this.db.select().from(adapters).where(eq(adapters.runId, id)),
    ]);
    return { ...run, checkpoints, metrics, adapters: adapterRows };
  }

  async appendMetrics(runId: string, body: unknown) {
    const [run] = await this.db.select().from(trainingRuns).where(eq(trainingRuns.id, runId)).limit(1);
    if (!run) throw new NotFoundException('Training run not found');
    const parsed = AppendMetricsSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());

    const inserted = await this.db
      .insert(trainingMetrics)
      .values(
        parsed.data.metrics.map((m) => ({
          runId,
          step: m.step ?? 0,
          name: m.name,
          value: m.value,
          metadata: (m.metadata ?? {}) as Record<string, unknown>,
        })),
      )
      .returning();

    const loss = parsed.data.metrics.find((m) => m.name === 'loss');
    if (loss) {
      const step = loss.step ?? 0;
      await this.db.insert(trainingCheckpoints).values({
        runId,
        step,
        label: `step-${step}`,
        storageKey: `training/${runId}/ckpt-${step}`,
        metrics: { loss: loss.value },
      });
    }

    return { runId, metrics: inserted };
  }

  async listCheckpoints(runId: string) {
    return this.db
      .select()
      .from(trainingCheckpoints)
      .where(eq(trainingCheckpoints.runId, runId))
      .orderBy(asc(trainingCheckpoints.step));
  }

  async listAdapters(projectId: string) {
    return this.db
      .select()
      .from(adapters)
      .where(eq(adapters.projectId, projectId))
      .orderBy(desc(adapters.createdAt));
  }

  async promoteAdapter(adapterId: string, body: unknown) {
    const parsed = PromoteAdapterSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());

    const [adapter] = await this.db
      .select()
      .from(adapters)
      .where(eq(adapters.id, adapterId))
      .limit(1);
    if (!adapter) throw new NotFoundException('Adapter not found');

    const providerId = parsed.data.providerId ?? 'mock';
    const [provider] = await this.db
      .select()
      .from(providers)
      .where(eq(providers.id, providerId))
      .limit(1);
    if (!provider) throw new BadRequestException(`Unknown provider: ${providerId}`);

    const modelId =
      `lora-${adapter.id.replace(/-/g, '').slice(0, 12)}`.toLowerCase();
    const displayName = parsed.data.name ?? adapter.name;

    const [existing] = await this.db.select().from(models).where(eq(models.id, modelId)).limit(1);
    let publishedModel = existing;
    if (!existing) {
      const [created] = await this.db
        .insert(models)
        .values({
          id: modelId,
          providerId,
          name: displayName,
          description: `Promoted LoRA adapter (rank=${adapter.rank}, base=${adapter.baseModel})`,
          published: parsed.data.publish !== false,
          parameterSchema: {
            adapterId: adapter.id,
            rank: adapter.rank,
            baseModel: adapter.baseModel,
            storageKey: adapter.storageKey,
          },
        })
        .returning();
      publishedModel = created;
      await this.db
        .insert(modelCapabilities)
        .values({ modelId, capabilityId: 'image.generate' })
        .onConflictDoNothing();
    } else if (parsed.data.publish !== false) {
      const [updated] = await this.db
        .update(models)
        .set({ published: true, name: displayName })
        .where(eq(models.id, modelId))
        .returning();
      publishedModel = updated;
    }

    const [updatedAdapter] = await this.db
      .update(adapters)
      .set({
        status: 'published',
        modelHubId: publishedModel!.id,
        name: displayName,
      })
      .where(eq(adapters.id, adapterId))
      .returning();

    if (adapter.runId) {
      await this.db
        .update(trainingRuns)
        .set({ status: 'completed', completedAt: new Date() })
        .where(eq(trainingRuns.id, adapter.runId));
    }

    return { adapter: updatedAdapter, model: publishedModel };
  }
}

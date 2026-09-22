import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { PresignUploadRequestSchema } from '@studio-os/contracts';
import {
  assets,
  assetRelations,
  assetVersions,
  deliverables,
  takes,
  type Database,
} from '@studio-os/db';
import {
  planSelectiveUpdate,
  traverseAncestors,
  traverseDescendants,
  type Relation,
} from '@studio-os/graph';
import type { StorageBackend } from '@studio-os/storage';
import { desc, eq, inArray, or } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { DB } from '../db/db.tokens.js';
import { MediaQueueService } from '../queue/media-queue.service.js';
import { STORAGE } from '../storage/storage.module.js';

@Injectable()
export class AssetsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(STORAGE) private readonly storage: StorageBackend,
    @Optional() private readonly mediaQueue?: MediaQueueService,
  ) {}

  async presign(userId: string, body: unknown) {
    const parsed = PresignUploadRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    const data = parsed.data;
    const assetId = randomUUID();
    const key = `projects/${data.projectId}/assets/${assetId}/${data.filename}`;

    const [asset] = await this.db
      .insert(assets)
      .values({
        id: assetId,
        projectId: data.projectId,
        type: data.assetType,
        name: data.filename,
        mimeType: data.contentType,
        sizeBytes: data.sizeBytes,
        status: 'draft',
        createdBy: userId,
        metadata: { uploadKey: key, storageBackend: this.storage.kind },
      })
      .returning();

    if (!asset) throw new BadRequestException('Failed to create asset');

    await this.db.insert(assetVersions).values({
      assetId: asset.id,
      version: 1,
      storageKey: key,
    });

    const signed = await this.storage.presignPut(key, data.contentType, data.sizeBytes, 3600);

    return {
      assetId: asset.id,
      uploadUrl: signed.uploadUrl,
      key,
      expiresAt: signed.expiresAt,
      directPut: signed.directPut,
      storageBackend: this.storage.kind,
    };
  }

  async complete(assetId: string) {
    const [asset] = await this.db.select().from(assets).where(eq(assets.id, assetId)).limit(1);
    if (!asset) throw new NotFoundException('Asset not found');

    const [version] = await this.db
      .select()
      .from(assetVersions)
      .where(eq(assetVersions.assetId, assetId))
      .orderBy(desc(assetVersions.version))
      .limit(1);

    if (version?.storageKey) {
      const head = await this.storage.head(version.storageKey);
      if (!head.exists) {
        throw new BadRequestException('Upload not found in object storage');
      }
    }

    const [updated] = await this.db
      .update(assets)
      .set({ status: 'ready', updatedAt: new Date() })
      .where(eq(assets.id, assetId))
      .returning();

    if (version?.storageKey && this.mediaQueue) {
      await this.mediaQueue.enqueue({
        assetId,
        storageKey: version.storageKey,
        projectId: asset.projectId,
      });
    } else {
      console.log(`[assets] media-ingest pending asset=${assetId} key=${version?.storageKey}`);
    }

    return updated;
  }

  async listByProject(
    projectId: string,
    facets?: {
      type?: string;
      status?: string;
      character?: string;
      scene?: string;
      model?: string;
      source?: string;
      rating?: string;
      q?: string;
    },
  ) {
    let rows = await this.db.select().from(assets).where(eq(assets.projectId, projectId));

    if (facets?.type) rows = rows.filter((a) => a.type === facets.type);
    if (facets?.status) rows = rows.filter((a) => a.status === facets.status);
    if (facets?.rating) {
      const r = Number(facets.rating);
      rows = rows.filter((a) => a.rating != null && a.rating >= r);
    }
    if (facets?.q) {
      const q = facets.q.toLowerCase();
      rows = rows.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          (a.tags ?? []).some((t) => t.toLowerCase().includes(q)),
      );
    }
    if (facets?.character) {
      rows = rows.filter(
        (a) =>
          (a.metadata as Record<string, unknown>)?.characterId === facets.character ||
          (a.metadata as Record<string, unknown>)?.character === facets.character ||
          (a.tags ?? []).includes(facets.character!),
      );
    }
    if (facets?.scene) {
      rows = rows.filter(
        (a) =>
          (a.metadata as Record<string, unknown>)?.sceneId === facets.scene ||
          (a.metadata as Record<string, unknown>)?.scene === facets.scene,
      );
    }
    if (facets?.model) {
      rows = rows.filter(
        (a) => (a.metadata as Record<string, unknown>)?.modelId === facets.model,
      );
    }
    if (facets?.source) {
      rows = rows.filter(
        (a) =>
          (a.metadata as Record<string, unknown>)?.source === facets.source ||
          (a.metadata as Record<string, unknown>)?.providerId === facets.source,
      );
    }

    return rows.map((a) => ({
      ...a,
      facets: {
        type: a.type,
        status: a.status,
        rating: a.rating,
        character: (a.metadata as Record<string, unknown>)?.character ?? null,
        scene: (a.metadata as Record<string, unknown>)?.sceneId ?? null,
        model: (a.metadata as Record<string, unknown>)?.modelId ?? null,
        source: (a.metadata as Record<string, unknown>)?.source ?? (a.metadata as Record<string, unknown>)?.providerId ?? null,
      },
    }));
  }

  async getById(assetId: string) {
    const [asset] = await this.db.select().from(assets).where(eq(assets.id, assetId)).limit(1);
    if (!asset) throw new NotFoundException('Asset not found');
    return asset;
  }

  async getSignedUrl(assetId: string, variant: string) {
    const [version] = await this.db
      .select()
      .from(assetVersions)
      .where(eq(assetVersions.assetId, assetId))
      .orderBy(desc(assetVersions.version))
      .limit(1);
    if (!version) throw new NotFoundException('Asset version not found');

    let key = version.storageKey;
    if (variant === 'proxy' && version.proxyKey) key = version.proxyKey;
    else if ((variant === 'poster' || variant === 'thumbnail') && version.thumbnailKey) {
      key = version.thumbnailKey;
    } else if (variant === 'source') {
      key = version.storageKey;
    }

    if (!key) throw new NotFoundException(`Variant ${variant} not available`);

    const signed = await this.storage.presignGet(key, 3600);
    return { url: signed.url, variant, key, expiresIn: 3600 };
  }

  async getLineage(assetId: string) {
    const [asset] = await this.db.select().from(assets).where(eq(assets.id, assetId)).limit(1);
    if (!asset) throw new NotFoundException('Asset not found');

    const projectAssets = await this.db
      .select({ id: assets.id })
      .from(assets)
      .where(eq(assets.projectId, asset.projectId));
    const projectAssetIds = projectAssets.map((a) => a.id);

    const relRows =
      projectAssetIds.length > 0
        ? await this.db
            .select()
            .from(assetRelations)
            .where(
              or(
                inArray(assetRelations.parentAssetId, projectAssetIds),
                inArray(assetRelations.childAssetId, projectAssetIds),
              ),
            )
        : [];

    const relations: Relation[] = relRows.map((row) => ({
      parentAssetId: row.parentAssetId,
      childAssetId: row.childAssetId,
      relationType: row.relationType,
      stale: row.stale,
    }));

    const ancestorIds = traverseAncestors(assetId, relations);
    const descendantIds = traverseDescendants(assetId, relations);
    const nodeIds = [...new Set([assetId, ...ancestorIds, ...descendantIds])];

    const nodeAssets =
      nodeIds.length > 0
        ? await this.db.select().from(assets).where(inArray(assets.id, nodeIds))
        : [];

    const takeRows =
      nodeIds.length > 0
        ? await this.db.select().from(takes).where(inArray(takes.assetId, nodeIds))
        : [];

    const takesByAsset = new Map(takeRows.filter((t) => t.assetId).map((t) => [t.assetId!, t]));

    const nodes = nodeAssets.map((a) => {
      const take = takesByAsset.get(a.id);
      const meta = (a.metadata ?? {}) as Record<string, unknown>;
      return {
        id: a.id,
        label: a.name,
        kind: 'asset' as const,
        type: a.type,
        status: a.status,
        stale: relations.some(
          (r) => (r.childAssetId === a.id || r.parentAssetId === a.id) && r.stale,
        ),
        inspect: {
          prompt: take?.promptCompiled ?? meta.prompt ?? null,
          model: take?.modelId ?? meta.modelId ?? null,
          seed: take?.seed ?? meta.seed ?? null,
          costUsd: take?.costUsd ?? meta.costUsd ?? null,
          providerId: take?.providerId ?? null,
          takeId: take?.id ?? null,
          takeNumber: take?.number ?? null,
        },
      };
    });

    const edges = relations
      .filter((r) => nodeIds.includes(r.parentAssetId) && nodeIds.includes(r.childAssetId))
      .map((r) => ({
        from: r.parentAssetId,
        to: r.childAssetId,
        relationType: r.relationType,
        stale: r.stale ?? false,
      }));

    const plan = planSelectiveUpdate(assetId, relations);

    return {
      assetId,
      nodes,
      edges,
      ancestors: ancestorIds,
      descendants: descendantIds,
      staleDependents: plan.affectedAssetIds,
      suggestedActions: plan.suggestedActions,
    };
  }

  /** Stub: mark stale dependents and return a selective-update plan (no auto-regenerate). */
  async updateStaleDependents(assetId: string) {
    const lineage = await this.getLineage(assetId);
    const plan = {
      affectedAssetIds: lineage.staleDependents,
      suggestedActions: lineage.suggestedActions,
      message: 'Stale dependents marked for review — regenerate from Jobs or Compare.',
    };

    if (lineage.staleDependents.length > 0) {
      for (const childId of lineage.staleDependents) {
        await this.db
          .update(assetRelations)
          .set({ stale: true })
          .where(eq(assetRelations.childAssetId, childId));
      }
    }

    return plan;
  }

  async getDeliverableSignedUrl(deliverableId: string) {
    const [row] = await this.db
      .select()
      .from(deliverables)
      .where(eq(deliverables.id, deliverableId))
      .limit(1);
    if (!row) throw new NotFoundException('Deliverable not found');

    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    const storageKey =
      (typeof meta.storageKey === 'string' && meta.storageKey) ||
      (row.assetId
        ? (
            await this.db
              .select()
              .from(assetVersions)
              .where(eq(assetVersions.assetId, row.assetId))
              .orderBy(desc(assetVersions.version))
              .limit(1)
          )[0]?.storageKey
        : null);

    if (!storageKey) {
      throw new NotFoundException('Deliverable not ready — no storage key yet');
    }

    const signed = await this.storage.presignGet(storageKey, 3600);

    return {
      url: signed.url,
      deliverableId,
      status: row.status,
      preset: row.preset,
      storageKey,
      expiresIn: 3600,
    };
  }
}

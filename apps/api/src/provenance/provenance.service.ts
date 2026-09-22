import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  assetRelations,
  assets,
  contentCredentials,
  deliverables,
  provenanceActions,
  provenanceIngredients,
  provenanceManifests,
  provenanceSignatures,
  type Database,
} from '@studio-os/db';
import {
  buildC2paLiteClaim,
  generateDevKeyPair,
  signC2paClaim,
  type C2paKeyPair,
} from '@studio-os/provenance';
import { eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { DB } from '../db/db.tokens.js';

const SignAssetSchema = z.object({
  modelId: z.string().optional(),
  prompt: z.string().optional(),
  parameters: z.record(z.unknown()).optional(),
  title: z.string().optional(),
  action: z.string().default('c2pa.created'),
});

@Injectable()
export class ProvenanceService {
  private cert!: C2paKeyPair;

  constructor(@Inject(DB) private readonly db: Database) {
    this.cert = this.loadOrCreateDevCert();
  }

  private loadOrCreateDevCert(): C2paKeyPair {
    const dir = join(process.cwd(), '.studioos');
    const pubPath = join(dir, 'c2pa-dev-public.pem');
    const privPath = join(dir, 'c2pa-dev-private.pem');
    if (existsSync(pubPath) && existsSync(privPath)) {
      return {
        publicKeyPem: readFileSync(pubPath, 'utf8'),
        privateKeyPem: readFileSync(privPath, 'utf8'),
      };
    }
    mkdirSync(dir, { recursive: true });
    const pair = generateDevKeyPair();
    writeFileSync(pubPath, pair.publicKeyPem);
    writeFileSync(privPath, pair.privateKeyPem);
    return pair;
  }

  private signClaim(claimJson: Record<string, unknown>): string {
    return signC2paClaim(claimJson, this.cert.privateKeyPem);
  }

  async signAsset(assetId: string, body: unknown) {
    const input = SignAssetSchema.parse(body ?? {});
    const [asset] = await this.db.select().from(assets).where(eq(assets.id, assetId)).limit(1);
    if (!asset) throw new NotFoundException('Asset not found');

    const claimJson = buildC2paLiteClaim({
      assetId: asset.id,
      projectId: asset.projectId,
      title: input.title ?? asset.name,
      action: input.action,
      modelId:
        input.modelId ??
        ((asset.metadata as Record<string, unknown>)?.modelId as string | undefined),
      prompt: input.prompt,
      parameters: input.parameters,
    });

    const [credential] = await this.db
      .insert(contentCredentials)
      .values({
        assetId: asset.id,
        projectId: asset.projectId,
        claimGenerator: 'StudioOS',
        title: input.title ?? asset.name,
        status: 'signed',
        metadata: { format: 'c2pa-lite' },
      })
      .returning();

    const [manifest] = await this.db
      .insert(provenanceManifests)
      .values({
        assetId: asset.id,
        contentCredentialId: credential!.id,
        format: 'c2pa-lite',
        claimJson,
      })
      .returning();

    const signature = this.signClaim(claimJson);
    const [sigRow] = await this.db
      .insert(provenanceSignatures)
      .values({
        manifestId: manifest!.id,
        algorithm: 'RSA-SHA256',
        publicKeyPem: this.cert.publicKeyPem,
        signature,
      })
      .returning();

    await this.db.insert(provenanceActions).values({
      manifestId: manifest!.id,
      action: input.action,
      softwareAgent: 'StudioOS',
      modelId: input.modelId ?? ((asset.metadata as Record<string, unknown>)?.modelId as string) ?? null,
      prompt: input.prompt ?? null,
      parameters: input.parameters ?? {},
    });

    // Ingredients from asset_relations (parents of this asset)
    const relations = await this.db
      .select()
      .from(assetRelations)
      .where(eq(assetRelations.childAssetId, assetId));

    for (const rel of relations) {
      const [parent] = await this.db
        .select({ id: assets.id, name: assets.name })
        .from(assets)
        .where(eq(assets.id, rel.parentAssetId))
        .limit(1);
      await this.db.insert(provenanceIngredients).values({
        manifestId: manifest!.id,
        assetId: rel.parentAssetId,
        relationType: rel.relationType,
        title: parent?.name ?? rel.parentAssetId,
        metadata: rel.metadata ?? {},
      });
    }

    // Embed lightweight credential pointer into asset metadata
    const meta = { ...(asset.metadata ?? {}), contentCredentialId: credential!.id, c2pa: true };
    await this.db.update(assets).set({ metadata: meta }).where(eq(assets.id, assetId));

    return {
      credential,
      manifest,
      signature: sigRow,
      ingredientCount: relations.length,
    };
  }

  async getAssetCredentials(assetId: string) {
    const credentials = await this.db
      .select()
      .from(contentCredentials)
      .where(eq(contentCredentials.assetId, assetId));

    const manifests = await this.db
      .select()
      .from(provenanceManifests)
      .where(eq(provenanceManifests.assetId, assetId));

    const manifestIds = manifests.map((m) => m.id);
    const actions =
      manifestIds.length === 0
        ? []
        : await this.db
            .select()
            .from(provenanceActions)
            .where(inArray(provenanceActions.manifestId, manifestIds));
    const ingredients =
      manifestIds.length === 0
        ? []
        : await this.db
            .select()
            .from(provenanceIngredients)
            .where(inArray(provenanceIngredients.manifestId, manifestIds));
    const signatures =
      manifestIds.length === 0
        ? []
        : await this.db
            .select()
            .from(provenanceSignatures)
            .where(inArray(provenanceSignatures.manifestId, manifestIds));

    return {
      assetId,
      credentials,
      manifests,
      actions,
      ingredients,
      signatures,
    };
  }

  /** Embed C2PA metadata pointer onto a deliverable when it has an asset. */
  async embedDeliverableCredentials(deliverableId: string) {
    const [deliverable] = await this.db
      .select()
      .from(deliverables)
      .where(eq(deliverables.id, deliverableId))
      .limit(1);
    if (!deliverable) throw new NotFoundException('Deliverable not found');
    if (!deliverable.assetId) {
      return { ok: false, reason: 'Deliverable has no asset yet' };
    }

    const creds = await this.getAssetCredentials(deliverable.assetId);
    if (creds.credentials.length === 0) {
      await this.signAsset(deliverable.assetId, {
        action: 'c2pa.exported',
        title: deliverable.name,
      });
    }

    const refreshed = await this.getAssetCredentials(deliverable.assetId);
    const metadata = {
      ...(deliverable.metadata ?? {}),
      contentCredentialId: refreshed.credentials[0]?.id,
      c2paEmbedded: true,
      embeddedAt: new Date().toISOString(),
    };
    const [updated] = await this.db
      .update(deliverables)
      .set({ metadata })
      .where(eq(deliverables.id, deliverableId))
      .returning();

    return { ok: true, deliverable: updated, credentials: refreshed };
  }
}

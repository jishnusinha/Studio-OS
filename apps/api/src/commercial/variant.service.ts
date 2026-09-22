import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  VariantEstimateRequestSchema,
  VariantGenerateRequestSchema,
  type CampaignBeatType,
  type VariantCellKey,
} from '@studio-os/contracts';
import {
  brands,
  campaignBeats,
  campaigns,
  campaignVariants,
  generationJobSteps,
  generationJobs,
  projects,
  type Database,
} from '@studio-os/db';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { DB } from '../db/db.tokens.js';
import { assertNoForbiddenClaims } from './claims.validator.js';
import {
  DEFAULT_VARIANT_DURATIONS,
  DEFAULT_VARIANT_FORMATS,
  DEFAULT_VARIANT_LANGUAGES,
  VARIANT_COST_PER_SEC_USD,
} from './templates.js';

function cellKey(c: VariantCellKey) {
  return `${c.format}|${c.language}|${c.durationSec}`;
}

@Injectable()
export class VariantService {
  constructor(@Inject(DB) private readonly db: Database) {}

  private async getCampaignOrThrow(campaignId: string) {
    const [campaign] = await this.db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1);
    if (!campaign) throw new NotFoundException('Campaign not found');
    return campaign;
  }

  async matrix(campaignId: string) {
    const campaign = await this.getCampaignOrThrow(campaignId);
    const existing = await this.db
      .select()
      .from(campaignVariants)
      .where(eq(campaignVariants.campaignId, campaignId));

    const byKey = new Map(
      existing.map((v) => [cellKey({ format: v.format as VariantCellKey['format'], language: v.language, durationSec: v.durationSec }), v]),
    );

    const formats = [...DEFAULT_VARIANT_FORMATS];
    const languages = [...DEFAULT_VARIANT_LANGUAGES];
    const durations = [...DEFAULT_VARIANT_DURATIONS];

    const cells = [];
    for (const format of formats) {
      for (const language of languages) {
        for (const durationSec of durations) {
          const key = cellKey({ format, language, durationSec });
          const row = byKey.get(key);
          cells.push({
            format,
            language,
            durationSec,
            status: (row?.status as 'missing' | 'ready' | 'generating') ?? 'missing',
            variantId: row?.id ?? null,
            branchId: row?.branchId ?? null,
            localization: row?.localization ?? null,
            estimatedCostUsd: row?.estimatedCostUsd ?? null,
            jobId: row?.jobId ?? null,
          });
        }
      }
    }

    return {
      campaignId,
      projectId: campaign.projectId,
      formats,
      languages,
      durations,
      cells,
      summary: {
        missing: cells.filter((c) => c.status === 'missing').length,
        ready: cells.filter((c) => c.status === 'ready').length,
        generating: cells.filter((c) => c.status === 'generating').length,
      },
    };
  }

  estimateCellCost(durationSec: number, selective: boolean, regenBeatCount: number) {
    const effectiveSec = selective
      ? Math.max(2, durationSec * (regenBeatCount / 6))
      : durationSec;
    const amount = effectiveSec * VARIANT_COST_PER_SEC_USD;
    return {
      amountUsd: Number(amount.toFixed(4)),
      effectiveSec: Number(effectiveSec.toFixed(2)),
    };
  }

  async estimate(campaignId: string, body: unknown) {
    const parsed = VariantEstimateRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    await this.getCampaignOrThrow(campaignId);

    const matrix = await this.matrix(campaignId);
    const missingKeys = new Set(
      matrix.cells.filter((c) => c.status === 'missing').map((c) => cellKey(c)),
    );

    const items = parsed.data.cells.map((cell) => {
      const isMissing = missingKeys.has(cellKey(cell));
      const cost = this.estimateCellCost(cell.durationSec, true, 2);
      return {
        ...cell,
        status: isMissing ? ('missing' as const) : ('ready' as const),
        included: isMissing,
        estimatedCostUsd: isMissing ? cost.amountUsd : 0,
        note: isMissing
          ? 'Selective regen (Hook + CTA); locked middle beats reused'
          : 'Already ready — skipped',
      };
    });

    const selected = items.filter((i) => i.included);
    const totalUsd = selected.reduce((sum, i) => sum + i.estimatedCostUsd, 0);

    return {
      campaignId,
      currency: 'USD',
      cellCount: selected.length,
      skipped: items.length - selected.length,
      totalUsd: Number(totalUsd.toFixed(4)),
      items,
    };
  }

  async generate(campaignId: string, userId: string, body: unknown) {
    const parsed = VariantGenerateRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const req = parsed.data;
    const campaign = await this.getCampaignOrThrow(campaignId);

    const beats = await this.db
      .select()
      .from(campaignBeats)
      .where(eq(campaignBeats.campaignId, campaignId));

    const [brand] = await this.db
      .select()
      .from(brands)
      .where(eq(brands.projectId, campaign.projectId))
      .limit(1);

    for (const beat of beats) {
      assertNoForbiddenClaims(beat.prompt, brand?.dna);
      assertNoForbiddenClaims(beat.copy, brand?.dna);
    }

    const regenTypes: CampaignBeatType[] =
      req.regenerateBeats?.length
        ? req.regenerateBeats
        : req.selective
          ? ['HOOK', 'CTA']
          : (beats.map((b) => b.beatType as CampaignBeatType));

    const lockedMiddle = beats.filter(
      (b) => b.locked || !regenTypes.includes(b.beatType as CampaignBeatType),
    );
    const regenBeats = beats.filter((b) =>
      regenTypes.includes(b.beatType as CampaignBeatType),
    );

    const [project] = await this.db
      .select()
      .from(projects)
      .where(eq(projects.id, campaign.projectId))
      .limit(1);
    if (!project) throw new NotFoundException('Project not found');

    const jobs = [];
    const variants = [];

    for (const cell of req.cells) {
      const existing = await this.db
        .select()
        .from(campaignVariants)
        .where(
          and(
            eq(campaignVariants.campaignId, campaignId),
            eq(campaignVariants.format, cell.format),
            eq(campaignVariants.language, cell.language),
            eq(campaignVariants.durationSec, cell.durationSec),
          ),
        )
        .limit(1);

      if (existing[0]?.status === 'ready' && req.selective) {
        // skip ready cells on selective runs unless explicitly missing/regenerating
        continue;
      }

      const cost = this.estimateCellCost(
        cell.durationSec,
        req.selective ?? true,
        regenBeats.length || 2,
      );

      const branchId = existing[0]?.branchId ?? randomUUID();
      const localization = {
        dubs: req.localization?.dubs ?? true,
        captions: req.localization?.captions ?? true,
        layout: req.localization?.layout ?? true,
        claims: req.localization?.claims ?? true,
        language: cell.language,
        format: cell.format,
        ...(existing[0]?.localization ?? {}),
      };

      const request = {
        workspaceId: project.workspaceId,
        projectId: campaign.projectId,
        capability: 'video.generate',
        intent: {
          prompt: `Campaign variant ${cell.format} ${cell.language} ${cell.durationSec}s — regen ${regenTypes.join(',')}`,
          parameters: {
            format: cell.format,
            language: cell.language,
            durationSec: cell.durationSec,
            selective: req.selective,
            regenerateBeats: regenTypes,
            reusedBeatIds: lockedMiddle.map((b) => b.id),
            campaignId,
          },
        },
        constraints: { qualityMode: 'draft' },
      };

      const [job] = await this.db
        .insert(generationJobs)
        .values({
          workspaceId: project.workspaceId,
          projectId: campaign.projectId,
          userId,
          capability: 'video.generate',
          status: 'queued',
          progress: 0,
          request,
          estimatedCostUsd: String(cost.amountUsd),
        })
        .returning();

      if (job) {
        await this.db.insert(generationJobSteps).values([
          { jobId: job.id, name: 'compile', status: 'pending', sortOrder: 0 },
          { jobId: job.id, name: 'generate', status: 'pending', sortOrder: 1 },
          { jobId: job.id, name: 'localize', status: 'pending', sortOrder: 2 },
          { jobId: job.id, name: 'finalize', status: 'pending', sortOrder: 3 },
        ]);
        jobs.push(job);
      }

      let variant;
      if (existing[0]) {
        const [updated] = await this.db
          .update(campaignVariants)
          .set({
            status: 'generating',
            branchId,
            localization,
            jobId: job?.id ?? null,
            estimatedCostUsd: String(cost.amountUsd),
            reusedBeatIds: lockedMiddle.map((b) => b.id),
            regeneratedBeatTypes: regenTypes,
            updatedAt: new Date(),
          })
          .where(eq(campaignVariants.id, existing[0].id))
          .returning();
        variant = updated;
      } else {
        const [created] = await this.db
          .insert(campaignVariants)
          .values({
            campaignId,
            projectId: campaign.projectId,
            format: cell.format,
            language: cell.language,
            durationSec: cell.durationSec,
            status: 'generating',
            branchId,
            localization,
            jobId: job?.id ?? null,
            estimatedCostUsd: String(cost.amountUsd),
            reusedBeatIds: lockedMiddle.map((b) => b.id),
            regeneratedBeatTypes: regenTypes,
          })
          .returning();
        variant = created;
      }
      if (variant) variants.push(variant);
    }

    return {
      campaignId,
      selective: req.selective ?? true,
      regenerateBeats: regenTypes,
      reusedBeatIds: lockedMiddle.map((b) => b.id),
      variants,
      jobs,
      totalEstimatedUsd: variants.reduce(
        (s, v) => s + Number(v.estimatedCostUsd ?? 0),
        0,
      ),
    };
  }
}

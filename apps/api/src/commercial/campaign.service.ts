import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BeatGrammarItemSchema,
  CreateCampaignRequestSchema,
  PatchBeatRequestSchema,
  type BeatGrammarItem,
  type BrandDna,
} from '@studio-os/contracts';
import {
  brands,
  campaignBeats,
  campaigns,
  campaignTemplates,
  generationJobSteps,
  generationJobs,
  projects,
  scenes,
  sequences,
  shots,
  type Database,
} from '@studio-os/db';
import { asc, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { DB } from '../db/db.tokens.js';
import { assertNoForbiddenClaims } from './claims.validator.js';
import { DEFAULT_BEAT_GRAMMAR, FALLBACK_TEMPLATES } from './templates.js';

@Injectable()
export class CampaignService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async listTemplates() {
    const rows = await this.db.select().from(campaignTemplates).orderBy(asc(campaignTemplates.name));
    if (rows.length > 0) return rows;
    return FALLBACK_TEMPLATES.map((t) => ({
      id: randomUUID(),
      slug: t.slug,
      name: t.name,
      description: t.description,
      beats: t.beats,
      defaultDurationSec: t.defaultDurationSec,
      metadata: {},
      createdAt: new Date(),
    }));
  }

  async listCampaigns(projectId: string) {
    const rows = await this.db
      .select()
      .from(campaigns)
      .where(eq(campaigns.projectId, projectId))
      .orderBy(asc(campaigns.createdAt));

    const beats = await this.db
      .select()
      .from(campaignBeats)
      .where(eq(campaignBeats.projectId, projectId))
      .orderBy(asc(campaignBeats.sortOrder));

    return rows.map((c) => ({
      ...c,
      beats: beats.filter((b) => b.campaignId === c.id),
    }));
  }

  async getCampaign(campaignId: string) {
    const [campaign] = await this.db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1);
    if (!campaign) throw new NotFoundException('Campaign not found');
    const beats = await this.db
      .select()
      .from(campaignBeats)
      .where(eq(campaignBeats.campaignId, campaignId))
      .orderBy(asc(campaignBeats.sortOrder));
    return { ...campaign, beats };
  }

  private parseBeats(raw: unknown): BeatGrammarItem[] {
    if (!Array.isArray(raw) || raw.length === 0) return DEFAULT_BEAT_GRAMMAR;
    const out: BeatGrammarItem[] = [];
    for (const item of raw) {
      const parsed = BeatGrammarItemSchema.safeParse(item);
      if (parsed.success) out.push(parsed.data);
    }
    return out.length ? out : DEFAULT_BEAT_GRAMMAR;
  }

  private async resolveTemplate(req: {
    templateId?: string;
    templateSlug?: string;
  }) {
    if (req.templateId) {
      const [row] = await this.db
        .select()
        .from(campaignTemplates)
        .where(eq(campaignTemplates.id, req.templateId))
        .limit(1);
      if (row) return row;
    }
    if (req.templateSlug) {
      const [row] = await this.db
        .select()
        .from(campaignTemplates)
        .where(eq(campaignTemplates.slug, req.templateSlug))
        .limit(1);
      if (row) return row;
      const fallback = FALLBACK_TEMPLATES.find((t) => t.slug === req.templateSlug);
      if (fallback) {
        return {
          id: null as string | null,
          slug: fallback.slug,
          name: fallback.name,
          description: fallback.description,
          beats: fallback.beats,
          defaultDurationSec: fallback.defaultDurationSec,
        };
      }
    }
    const [first] = await this.db.select().from(campaignTemplates).limit(1);
    if (first) return first;
    const fb = FALLBACK_TEMPLATES[0]!;
    return {
      id: null as string | null,
      slug: fb.slug,
      name: fb.name,
      description: fb.description,
      beats: fb.beats,
      defaultDurationSec: fb.defaultDurationSec,
    };
  }

  async createFromTemplate(projectId: string, body: unknown) {
    const parsed = CreateCampaignRequestSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const req = parsed.data;

    const template = await this.resolveTemplate(req);
    const beatGrammar = this.parseBeats(template.beats);
    const durationSec = req.durationSec ?? template.defaultDurationSec ?? 18;

    let brandId = req.brandId ?? null;
    if (!brandId) {
      const [brand] = await this.db
        .select()
        .from(brands)
        .where(eq(brands.projectId, projectId))
        .limit(1);
      brandId = brand?.id ?? null;
    }

    const [campaign] = await this.db
      .insert(campaigns)
      .values({
        projectId,
        brandId,
        productId: req.productId ?? null,
        templateId: template.id,
        name: req.name ?? template.name,
        durationSec,
        status: 'draft',
        data: { templateSlug: template.slug },
      })
      .returning();
    if (!campaign) throw new BadRequestException('Failed to create campaign');

    const [sequence] = await this.db
      .insert(sequences)
      .values({
        projectId,
        number: 1,
        title: `${campaign.name} Sequence`,
        description: `Commercial sequence for ${campaign.name}`,
        sortOrder: 0,
      })
      .returning();

    const [scene] = await this.db
      .insert(scenes)
      .values({
        projectId,
        sequenceId: sequence?.id,
        number: 1,
        slug: 'COM',
        heading: `COMMERCIAL — ${campaign.name}`,
        synopsis: template.description ?? 'Commercial campaign beats',
        durationTargetSec: durationSec,
        sortOrder: 0,
      })
      .returning();
    if (!scene) throw new BadRequestException('Failed to create scene for campaign');

    const createdBeats = [];
    for (let i = 0; i < beatGrammar.length; i++) {
      const beat = beatGrammar[i]!;
      const code = `C${i + 1}`;
      const prompt =
        beat.promptHint ??
        `${beat.label ?? beat.type} beat for ${campaign.name}`;

      const [shot] = await this.db
        .insert(shots)
        .values({
          projectId,
          sceneId: scene.id,
          code,
          description: prompt,
          durationSec: Math.max(0.5, beat.endSec - beat.startSec),
          sortOrder: i,
          locked: Boolean(beat.locked),
          shotDna: {
            beatType: beat.type,
            campaignId: campaign.id,
            startSec: beat.startSec,
            endSec: beat.endSec,
          },
          status: 'draft',
        })
        .returning();

      const [row] = await this.db
        .insert(campaignBeats)
        .values({
          campaignId: campaign.id,
          projectId,
          beatType: beat.type,
          label: beat.label ?? beat.type,
          startSec: beat.startSec,
          endSec: beat.endSec,
          prompt,
          copy: null,
          shotId: shot?.id ?? null,
          locked: Boolean(beat.locked),
          status: 'draft',
          sortOrder: i,
          data: { promptHint: beat.promptHint },
        })
        .returning();
      if (row) createdBeats.push(row);
    }

    return { ...campaign, beats: createdBeats, sceneId: scene.id };
  }

  private async brandDnaForProject(projectId: string): Promise<BrandDna | null> {
    const [brand] = await this.db
      .select()
      .from(brands)
      .where(eq(brands.projectId, projectId))
      .limit(1);
    if (!brand) return null;
    return brand.dna as BrandDna;
  }

  async patchBeat(beatId: string, body: unknown) {
    const parsed = PatchBeatRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());

    const [beat] = await this.db
      .select()
      .from(campaignBeats)
      .where(eq(campaignBeats.id, beatId))
      .limit(1);
    if (!beat) throw new NotFoundException('Beat not found');

    const dna = await this.brandDnaForProject(beat.projectId);
    const nextPrompt = parsed.data.prompt ?? beat.prompt;
    const nextCopy = parsed.data.copy ?? beat.copy;
    assertNoForbiddenClaims(nextPrompt, dna);
    assertNoForbiddenClaims(nextCopy, dna);

    const [updated] = await this.db
      .update(campaignBeats)
      .set({
        label: parsed.data.label ?? beat.label,
        startSec: parsed.data.startSec ?? beat.startSec,
        endSec: parsed.data.endSec ?? beat.endSec,
        prompt: nextPrompt,
        copy: nextCopy,
        locked: parsed.data.locked ?? beat.locked,
        status: parsed.data.status ?? beat.status,
        updatedAt: new Date(),
        data: {
          ...beat.data,
          ...(parsed.data.shotDna ? { shotDna: parsed.data.shotDna } : {}),
        },
      })
      .where(eq(campaignBeats.id, beatId))
      .returning();

    if (beat.shotId && (parsed.data.prompt || parsed.data.shotDna || parsed.data.locked != null)) {
      await this.db
        .update(shots)
        .set({
          description: nextPrompt ?? undefined,
          locked: parsed.data.locked ?? undefined,
          shotDna: {
            ...(((
              await this.db.select().from(shots).where(eq(shots.id, beat.shotId)).limit(1)
            )[0]?.shotDna as Record<string, unknown>) ?? {}),
            ...(parsed.data.shotDna ?? {}),
            beatType: beat.beatType,
          },
          updatedAt: new Date(),
        })
        .where(eq(shots.id, beat.shotId));
    }

    return updated;
  }

  async regenerateBeat(beatId: string, userId: string) {
    const [beat] = await this.db
      .select()
      .from(campaignBeats)
      .where(eq(campaignBeats.id, beatId))
      .limit(1);
    if (!beat) throw new NotFoundException('Beat not found');
    if (beat.locked) {
      throw new BadRequestException('Beat is locked — unlock before regenerating');
    }

    const dna = await this.brandDnaForProject(beat.projectId);
    const prompt =
      beat.prompt ??
      `${beat.label ?? beat.beatType} commercial beat`;
    assertNoForbiddenClaims(prompt, dna);
    assertNoForbiddenClaims(beat.copy, dna);

    const [project] = await this.db
      .select()
      .from(projects)
      .where(eq(projects.id, beat.projectId))
      .limit(1);
    if (!project) throw new NotFoundException('Project not found');

    const request = {
      workspaceId: project.workspaceId,
      projectId: beat.projectId,
      shotId: beat.shotId,
      capability: 'video.generate',
      intent: {
        prompt,
        parameters: {
          durationSec: Math.max(0.5, beat.endSec - beat.startSec),
          beatType: beat.beatType,
          campaignId: beat.campaignId,
        },
      },
      constraints: {
        qualityMode: 'draft',
      },
    };

    const [job] = await this.db
      .insert(generationJobs)
      .values({
        workspaceId: project.workspaceId,
        projectId: beat.projectId,
        userId,
        shotId: beat.shotId,
        capability: 'video.generate',
        status: 'queued',
        progress: 0,
        request,
        estimatedCostUsd: String(
          (Math.max(0.5, beat.endSec - beat.startSec) * 0.08).toFixed(4),
        ),
      })
      .returning();

    if (!job) throw new BadRequestException('Failed to create generation job');

    await this.db.insert(generationJobSteps).values([
      { jobId: job.id, name: 'compile', status: 'pending', sortOrder: 0 },
      { jobId: job.id, name: 'generate', status: 'pending', sortOrder: 1 },
      { jobId: job.id, name: 'finalize', status: 'pending', sortOrder: 2 },
    ]);

    await this.db
      .update(campaignBeats)
      .set({ status: 'generating', updatedAt: new Date() })
      .where(eq(campaignBeats.id, beatId));

    return { beatId, job, status: 'generating' };
  }
}

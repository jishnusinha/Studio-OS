import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  assetEmbeddings,
  assetRelations,
  characters,
  continuityChecks,
  continuityConstraints,
  continuityRepairs,
  continuityScores,
  generationJobSteps,
  generationJobs,
  lockedFacts,
  locations,
  projects,
  scenes,
  shotComparisons,
  shots,
  takes,
  type Database,
} from '@studio-os/db';
import { markDependentsStale, type Relation } from '@studio-os/graph';
import { and, desc, eq, inArray, or } from 'drizzle-orm';
import { z } from 'zod';
import { DB } from '../db/db.tokens.js';

const DIMENSIONS = ['wardrobe', 'prop', 'lighting', 'location', 'character'] as const;
type Dimension = (typeof DIMENSIONS)[number];

const RunCheckSchema = z.object({
  scopeType: z.enum(['project', 'sequence', 'scene']).default('project'),
  scopeId: z.string().uuid().optional().nullable(),
});

const VIOLATION_THRESHOLD = 0.75;

type Citation = {
  type: 'locked_fact' | 'constraint' | 'shot_dna' | 'embedding' | 'character' | 'location';
  id?: string;
  key?: string;
  value?: string;
  note?: string;
};

type ScoreDraft = {
  shotId: string;
  takeId: string | null;
  dimension: Dimension;
  score: number;
  details: Record<string, unknown>;
  citations: Citation[];
};

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

function cosineDistance(a: number[], b: number[]): number | null {
  if (!a.length || !b.length || a.length !== b.length) return null;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return null;
  const sim = dot / (Math.sqrt(na) * Math.sqrt(nb));
  return clamp01(1 - sim);
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function dnaPath(dna: Record<string, unknown>, path: string[]): unknown {
  let cur: unknown = dna;
  for (const key of path) {
    if (!cur || typeof cur !== 'object' || Array.isArray(cur)) return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

function stringifyLoose(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return '';
  }
}

function valuesEqual(a: unknown, b: unknown): boolean {
  return stringifyLoose(a).trim().toLowerCase() === stringifyLoose(b).trim().toLowerCase();
}

function factMatchesDimension(key: string, entityType: string, dimension: Dimension): boolean {
  const k = `${entityType}:${key}`.toLowerCase();
  if (dimension === 'wardrobe') {
    return /wardrobe|costume|outfit|clothing|jacket|shirt|dress/.test(k);
  }
  if (dimension === 'prop') {
    return /prop|object|item|product|hold|briefcase|gun/.test(k);
  }
  if (dimension === 'lighting') {
    return /light|lighting|key|fill|contrast|motivated/.test(k);
  }
  if (dimension === 'location') {
    return /location|place|set|environment|weather|time.?of.?day/.test(k);
  }
  if (dimension === 'character') {
    return /character|identity|face|hair|body|emotion|acting/.test(k);
  }
  return false;
}

function dimensionDnaPaths(dimension: Dimension): string[][] {
  switch (dimension) {
    case 'wardrobe':
      return [['subject', 'costumeId'], ['subject', 'wardrobe'], ['wardrobe']];
    case 'prop':
      return [['subject', 'props'], ['props'], ['subject', 'action']];
    case 'lighting':
      return [
        ['lighting'],
        ['lighting', 'key'],
        ['lighting', 'fill'],
        ['lighting', 'contrast'],
        ['lighting', 'motivatedBy'],
      ];
    case 'location':
      return [
        ['environment'],
        ['environment', 'locationId'],
        ['environment', 'time'],
        ['environment', 'weather'],
      ];
    case 'character':
      return [
        ['subject', 'characterId'],
        ['subject', 'emotion'],
        ['subject', 'action'],
      ];
  }
}

@Injectable()
export class ContinuityService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async runCheck(projectId: string, userId: string, body: unknown) {
    const parsed = RunCheckSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const { scopeType } = parsed.data;
    let scopeId = parsed.data.scopeId ?? null;

    if (scopeType !== 'project' && !scopeId) {
      throw new BadRequestException('scopeId is required for sequence/scene scope');
    }
    if (scopeType === 'project') scopeId = null;

    const shotRows = await this.resolveShots(projectId, scopeType, scopeId);

    const [check] = await this.db
      .insert(continuityChecks)
      .values({
        projectId,
        scopeType,
        scopeId,
        status: 'running',
        triggeredBy: userId,
        metadata: { shotCount: shotRows.length },
      })
      .returning();
    if (!check) throw new BadRequestException('Failed to create continuity check');

    try {
      const result = await this.scoreShots(check.id, projectId, shotRows);
      await this.db
        .update(continuityChecks)
        .set({
          status: 'completed',
          metadata: {
            shotCount: shotRows.length,
            scoreCount: result.scoreCount,
            comparisonCount: result.comparisonCount,
            violationCount: result.violationCount,
            avgScore: result.avgScore,
          },
        })
        .where(eq(continuityChecks.id, check.id));

      return this.getCheck(check.id);
    } catch (err) {
      await this.db
        .update(continuityChecks)
        .set({
          status: 'failed',
          metadata: {
            error: err instanceof Error ? err.message : 'Continuity check failed',
          },
        })
        .where(eq(continuityChecks.id, check.id));
      throw err;
    }
  }

  async listChecks(projectId: string) {
    return this.db
      .select()
      .from(continuityChecks)
      .where(eq(continuityChecks.projectId, projectId))
      .orderBy(desc(continuityChecks.createdAt));
  }

  async getCheck(checkId: string) {
    const [check] = await this.db
      .select()
      .from(continuityChecks)
      .where(eq(continuityChecks.id, checkId))
      .limit(1);
    if (!check) throw new NotFoundException('Continuity check not found');

    const scores = await this.db
      .select()
      .from(continuityScores)
      .where(eq(continuityScores.checkId, checkId));
    const comparisons = await this.db
      .select()
      .from(shotComparisons)
      .where(eq(shotComparisons.checkId, checkId));
    const repairs = await this.db
      .select()
      .from(continuityRepairs)
      .where(eq(continuityRepairs.checkId, checkId));

    const byScene = await this.sceneHeatmap(check.projectId, scores);

    return {
      ...check,
      scores,
      comparisons,
      repairs,
      heatmap: byScene,
      violations: scores.filter((s) => s.score < VIOLATION_THRESHOLD),
    };
  }

  async repairScore(scoreId: string, userId: string) {
    const [score] = await this.db
      .select()
      .from(continuityScores)
      .where(eq(continuityScores.id, scoreId))
      .limit(1);
    if (!score) throw new NotFoundException('Continuity score not found');

    const [check] = await this.db
      .select()
      .from(continuityChecks)
      .where(eq(continuityChecks.id, score.checkId))
      .limit(1);
    if (!check) throw new NotFoundException('Continuity check not found');

    if (score.score >= VIOLATION_THRESHOLD) {
      throw new BadRequestException('Score is within continuity threshold; nothing to repair');
    }

    const [shot] = await this.db.select().from(shots).where(eq(shots.id, score.shotId)).limit(1);
    if (!shot) throw new NotFoundException('Shot not found');

    const [project] = await this.db
      .select()
      .from(projects)
      .where(eq(projects.id, check.projectId))
      .limit(1);
    if (!project) throw new NotFoundException('Project not found');

    const hardConstraint = this.buildHardConstraint({
      dimension: score.dimension,
      details: asRecord(score.details),
      citations: score.citations,
    });
    const prompt = [
      shot.description?.trim() || `Regenerate shot ${shot.code}`,
      `HARD CONTINUITY CONSTRAINT (${score.dimension}): ${hardConstraint}`,
    ].join('\n\n');

    const request = {
      workspaceId: project.workspaceId,
      projectId: check.projectId,
      shotId: shot.id,
      capability: 'image.generate',
      intent: {
        prompt,
        shotDna: shot.shotDna ?? {},
        parameters: {
          hardConstraints: [
            {
              dimension: score.dimension,
              constraint: hardConstraint,
              scoreId: score.id,
              checkId: check.id,
            },
          ],
          continuityRepair: true,
        },
      },
      constraints: {
        qualityMode: 'draft',
        takeCount: 1,
      },
      parentAssetIds: [],
    };

    const [job] = await this.db
      .insert(generationJobs)
      .values({
        workspaceId: project.workspaceId,
        projectId: check.projectId,
        userId,
        shotId: shot.id,
        capability: 'image.generate',
        status: 'queued',
        progress: 0,
        request,
      })
      .returning();
    if (!job) throw new BadRequestException('Failed to create repair job');

    await this.db.insert(generationJobSteps).values([
      { jobId: job.id, name: 'compile', status: 'pending', sortOrder: 0 },
      { jobId: job.id, name: 'generate', status: 'pending', sortOrder: 1 },
      { jobId: job.id, name: 'finalize', status: 'pending', sortOrder: 2 },
    ]);

    const stale = await this.markShotDependentsStale(shot.id);

    const [repair] = await this.db
      .insert(continuityRepairs)
      .values({
        checkId: check.id,
        scoreId: score.id,
        shotId: shot.id,
        strategy: 'regenerate_hard_constraint',
        jobId: job.id,
        status: 'queued',
      })
      .returning();

    return { repair, job, hardConstraint, staleDependents: stale };
  }

  async repairBatch(checkId: string, userId: string) {
    const detail = await this.getCheck(checkId);
    const violations = detail.violations;
    if (violations.length === 0) {
      return { checkId, repairs: [], message: 'No violations to repair' };
    }

    // One repair per shot (worst violating dimension)
    const worstByShot = new Map<string, (typeof violations)[number]>();
    for (const v of violations) {
      const prev = worstByShot.get(v.shotId);
      if (!prev || v.score < prev.score) worstByShot.set(v.shotId, v);
    }

    const repairs = [];
    for (const score of worstByShot.values()) {
      repairs.push(await this.repairScore(score.id, userId));
    }
    return { checkId, repairs, count: repairs.length };
  }

  private buildHardConstraint(score: {
    dimension: string;
    details: Record<string, unknown> | null;
    citations: unknown;
  }): string {
    const details = asRecord(score.details);
    const citations = Array.isArray(score.citations) ? score.citations : [];
    const citationBits = citations
      .map((c) => {
        const row = asRecord(c);
        if (row.key && row.value) return `${row.key}=${row.value}`;
        if (row.note) return String(row.note);
        return null;
      })
      .filter(Boolean)
      .slice(0, 4);

    const explanation =
      typeof details.explanation === 'string'
        ? details.explanation
        : `Restore ${score.dimension} continuity`;

    if (citationBits.length) {
      return `${explanation}. Enforce: ${citationBits.join('; ')}`;
    }
    return explanation;
  }

  private async markShotDependentsStale(shotId: string): Promise<string[]> {
    const takeRows = await this.db.select().from(takes).where(eq(takes.shotId, shotId));
    const assetIds = takeRows.map((t) => t.assetId).filter((id): id is string => Boolean(id));
    if (assetIds.length === 0) return [];

    const relRows = await this.db
      .select()
      .from(assetRelations)
      .where(
        or(
          inArray(assetRelations.parentAssetId, assetIds),
          inArray(assetRelations.childAssetId, assetIds),
        ),
      );

    const relations: Relation[] = relRows.map((row) => ({
      parentAssetId: row.parentAssetId,
      childAssetId: row.childAssetId,
      relationType: row.relationType,
      stale: row.stale,
    }));

    const affected = new Set<string>();
    let updated = relations;
    for (const assetId of assetIds) {
      updated = markDependentsStale(assetId, updated);
      for (const rel of updated) {
        if (rel.stale) affected.add(rel.childAssetId);
      }
    }

    for (const childId of affected) {
      await this.db
        .update(assetRelations)
        .set({ stale: true })
        .where(eq(assetRelations.childAssetId, childId));
    }

    return [...affected];
  }

  private async resolveShots(
    projectId: string,
    scopeType: 'project' | 'sequence' | 'scene',
    scopeId: string | null,
  ) {
    if (scopeType === 'scene' && scopeId) {
      return this.db
        .select()
        .from(shots)
        .where(and(eq(shots.projectId, projectId), eq(shots.sceneId, scopeId)))
        .orderBy(shots.sortOrder);
    }

    if (scopeType === 'sequence' && scopeId) {
      const sceneRows = await this.db
        .select({ id: scenes.id })
        .from(scenes)
        .where(and(eq(scenes.projectId, projectId), eq(scenes.sequenceId, scopeId)));
      const sceneIds = sceneRows.map((s) => s.id);
      if (sceneIds.length === 0) return [];
      return this.db
        .select()
        .from(shots)
        .where(and(eq(shots.projectId, projectId), inArray(shots.sceneId, sceneIds)))
        .orderBy(shots.sortOrder);
    }

    return this.db
      .select()
      .from(shots)
      .where(eq(shots.projectId, projectId))
      .orderBy(shots.sortOrder);
  }

  private async scoreShots(
    checkId: string,
    projectId: string,
    shotRows: (typeof shots.$inferSelect)[],
  ) {
    const facts = await this.db
      .select()
      .from(lockedFacts)
      .where(and(eq(lockedFacts.projectId, projectId), eq(lockedFacts.locked, true)));

    const constraints = await this.db
      .select()
      .from(continuityConstraints)
      .where(
        and(
          eq(continuityConstraints.projectId, projectId),
          eq(continuityConstraints.locked, true),
        ),
      );

    const charRows = await this.db
      .select()
      .from(characters)
      .where(eq(characters.projectId, projectId));
    const locRows = await this.db
      .select()
      .from(locations)
      .where(eq(locations.projectId, projectId));
    const charsById = new Map(charRows.map((c) => [c.id, c]));
    const locsById = new Map(locRows.map((l) => [l.id, l]));

    const shotIds = shotRows.map((s) => s.id);
    const takeRows =
      shotIds.length > 0
        ? await this.db.select().from(takes).where(inArray(takes.shotId, shotIds))
        : [];
    const selectedTake = new Map<string, (typeof takeRows)[number]>();
    for (const t of takeRows) {
      const prev = selectedTake.get(t.shotId);
      if (!prev || t.selected || (!prev.selected && t.number > prev.number)) {
        selectedTake.set(t.shotId, t);
      }
    }

    const assetIds = [...selectedTake.values()]
      .map((t) => t.assetId)
      .filter((id): id is string => Boolean(id));
    const embRows =
      assetIds.length > 0
        ? await this.db
            .select()
            .from(assetEmbeddings)
            .where(inArray(assetEmbeddings.assetId, assetIds))
        : [];
    const embByAsset = new Map<string, number[]>();
    for (const e of embRows) {
      if (e.embedding?.length) embByAsset.set(e.assetId, e.embedding);
    }

    const drafts: ScoreDraft[] = [];
    const comparisonInserts: {
      checkId: string;
      leftShotId: string;
      rightShotId: string;
      leftTakeId: string | null;
      rightTakeId: string | null;
      embeddingDistance: number | null;
      diff: Record<string, unknown>;
    }[] = [];

    // Pair adjacent shots within the same scene
    const byScene = new Map<string, typeof shotRows>();
    for (const s of shotRows) {
      const list = byScene.get(s.sceneId) ?? [];
      list.push(s);
      byScene.set(s.sceneId, list);
    }

    for (const sceneShots of byScene.values()) {
      const ordered = [...sceneShots].sort((a, b) => a.sortOrder - b.sortOrder);
      for (let i = 0; i < ordered.length - 1; i++) {
        const left = ordered[i]!;
        const right = ordered[i + 1]!;
        const leftTake = selectedTake.get(left.id) ?? null;
        const rightTake = selectedTake.get(right.id) ?? null;
        const leftEmb = leftTake?.assetId ? embByAsset.get(leftTake.assetId) : undefined;
        const rightEmb = rightTake?.assetId ? embByAsset.get(rightTake.assetId) : undefined;
        const distance =
          leftEmb && rightEmb ? cosineDistance(leftEmb, rightEmb) : null;

        const dnaDiff = this.diffShotDna(
          asRecord(left.shotDna),
          asRecord(right.shotDna),
        );

        comparisonInserts.push({
          checkId,
          leftShotId: left.id,
          rightShotId: right.id,
          leftTakeId: leftTake?.id ?? null,
          rightTakeId: rightTake?.id ?? null,
          embeddingDistance: distance,
          diff: { dna: dnaDiff, embeddingDistance: distance },
        });
      }
    }

    for (const shot of shotRows) {
      const dna = asRecord(shot.shotDna);
      const take = selectedTake.get(shot.id) ?? null;
      const character = shot.characterId ? charsById.get(shot.characterId) : undefined;
      const envLocId = stringifyLoose(dnaPath(dna, ['environment', 'locationId']));
      const location = envLocId ? locsById.get(envLocId) : undefined;

      for (const dimension of DIMENSIONS) {
        const draft = this.scoreDimension({
          dimension,
          shot,
          dna,
          take,
          facts,
          constraints,
          character,
          location,
          neighbors: this.neighborShots(shot, byScene.get(shot.sceneId) ?? []),
          embByAsset,
          selectedTake,
        });
        drafts.push(draft);
      }
    }

    if (comparisonInserts.length > 0) {
      await this.db.insert(shotComparisons).values(comparisonInserts);
    }
    if (drafts.length > 0) {
      await this.db.insert(continuityScores).values(
        drafts.map((d) => ({
          checkId,
          shotId: d.shotId,
          takeId: d.takeId,
          dimension: d.dimension,
          score: d.score,
          details: d.details,
          citations: d.citations,
        })),
      );
    }

    const avg =
      drafts.length === 0
        ? 1
        : drafts.reduce((sum, d) => sum + d.score, 0) / drafts.length;

    return {
      scoreCount: drafts.length,
      comparisonCount: comparisonInserts.length,
      violationCount: drafts.filter((d) => d.score < VIOLATION_THRESHOLD).length,
      avgScore: Math.round(avg * 1000) / 1000,
    };
  }

  private neighborShots(
    shot: typeof shots.$inferSelect,
    sceneShots: (typeof shots.$inferSelect)[],
  ) {
    const ordered = [...sceneShots].sort((a, b) => a.sortOrder - b.sortOrder);
    const idx = ordered.findIndex((s) => s.id === shot.id);
    return {
      prev: idx > 0 ? ordered[idx - 1]! : null,
      next: idx >= 0 && idx < ordered.length - 1 ? ordered[idx + 1]! : null,
    };
  }

  private diffShotDna(a: Record<string, unknown>, b: Record<string, unknown>) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    const changed: Record<string, { left: unknown; right: unknown }> = {};
    for (const key of keys) {
      if (!valuesEqual(a[key], b[key])) {
        changed[key] = { left: a[key] ?? null, right: b[key] ?? null };
      }
    }
    return changed;
  }

  private scoreDimension(input: {
    dimension: Dimension;
    shot: typeof shots.$inferSelect;
    dna: Record<string, unknown>;
    take: typeof takes.$inferSelect | null;
    facts: (typeof lockedFacts.$inferSelect)[];
    constraints: (typeof continuityConstraints.$inferSelect)[];
    character: typeof characters.$inferSelect | undefined;
    location: typeof locations.$inferSelect | undefined;
    neighbors: {
      prev: typeof shots.$inferSelect | null;
      next: typeof shots.$inferSelect | null;
    };
    embByAsset: Map<string, number[]>;
    selectedTake: Map<string, typeof takes.$inferSelect>;
  }): ScoreDraft {
    const citations: Citation[] = [];
    const issues: string[] = [];
    let score = 1;

    const relevantFacts = input.facts.filter((f) =>
      factMatchesDimension(f.key, f.entityType, input.dimension),
    );
    const relevantConstraints = input.constraints.filter((c) =>
      factMatchesDimension(c.key, c.entityType, input.dimension),
    );

    // Locked facts / continuity constraints vs shot DNA (and character wardrobe DNA)
    for (const fact of relevantFacts) {
      citations.push({
        type: 'locked_fact',
        id: fact.id,
        key: fact.key,
        value: fact.value,
      });
      const observed = this.observeValue(input, fact.key, fact.entityType);
      if (observed != null && observed !== '' && !valuesEqual(observed, fact.value)) {
        score -= 0.25;
        issues.push(`Locked fact "${fact.key}" expects "${fact.value}" but shot has "${observed}"`);
      }
    }

    for (const c of relevantConstraints) {
      citations.push({
        type: 'constraint',
        id: c.id,
        key: c.key,
        value: c.value,
      });
      const observed = this.observeValue(input, c.key, c.entityType);
      if (observed != null && observed !== '' && !valuesEqual(observed, c.value)) {
        score -= c.autoEnforce ? 0.3 : 0.15;
        issues.push(
          `Constraint "${c.key}" expects "${c.value}" but shot has "${observed}"`,
        );
      }
    }

    // Shot DNA consistency vs neighbors
    const neighbor = input.neighbors.prev ?? input.neighbors.next;
    if (neighbor) {
      const neighborDna = asRecord(neighbor.shotDna);
      for (const path of dimensionDnaPaths(input.dimension)) {
        const left = dnaPath(input.dna, path);
        const right = dnaPath(neighborDna, path);
        if (
          left != null &&
          right != null &&
          stringifyLoose(left) !== '' &&
          stringifyLoose(right) !== '' &&
          !valuesEqual(left, right)
        ) {
          // Character id / location id mismatches are hard; lighting look soft
          const hard =
            input.dimension === 'character' ||
            input.dimension === 'location' ||
            input.dimension === 'wardrobe';
          score -= hard ? 0.2 : 0.1;
          const pathKey = path.join('.');
          issues.push(
            `Shot DNA ${pathKey} differs from neighbor ${neighbor.code}: ${stringifyLoose(left)} vs ${stringifyLoose(right)}`,
          );
          citations.push({
            type: 'shot_dna',
            key: pathKey,
            value: `${stringifyLoose(left)} ≠ ${stringifyLoose(right)}`,
            note: `Compared with shot ${neighbor.code}`,
          });
        }
      }
    }

    // Dimension-specific canon anchors
    if (input.dimension === 'character' && input.character) {
      citations.push({
        type: 'character',
        id: input.character.id,
        key: 'name',
        value: input.character.name,
      });
      const dnaChar = stringifyLoose(dnaPath(input.dna, ['subject', 'characterId']));
      if (dnaChar && dnaChar !== input.shot.characterId && input.shot.characterId) {
        score -= 0.2;
        issues.push('Shot characterId does not match Shot DNA subject.characterId');
      }
    }

    if (input.dimension === 'wardrobe' && input.character) {
      const wardrobe = asRecord(input.character.wardrobe);
      if (Object.keys(wardrobe).length > 0) {
        citations.push({
          type: 'character',
          id: input.character.id,
          key: 'wardrobe',
          value: stringifyLoose(wardrobe),
        });
        const costumeId = stringifyLoose(dnaPath(input.dna, ['subject', 'costumeId']));
        if (costumeId && !(costumeId in wardrobe) && !Object.values(wardrobe).some((v) => valuesEqual(v, costumeId))) {
          score -= 0.2;
          issues.push(`Costume "${costumeId}" is not in locked character wardrobe`);
        }
      }
    }

    if (input.dimension === 'location' && input.location) {
      citations.push({
        type: 'location',
        id: input.location.id,
        key: 'name',
        value: input.location.name,
      });
    }

    // Embedding distance vs neighbor when available
    if (neighbor && input.take?.assetId) {
      const neighborTake = input.selectedTake.get(neighbor.id);
      const a = embByAssetGet(input.embByAsset, input.take.assetId);
      const b = neighborTake?.assetId
        ? embByAssetGet(input.embByAsset, neighborTake.assetId)
        : null;
      if (a && b) {
        const dist = cosineDistance(a, b);
        if (dist != null) {
          citations.push({
            type: 'embedding',
            note: `Cosine distance to ${neighbor.code}: ${dist.toFixed(3)}`,
          });
          // High visual distance on wardrobe/character dims is more concerning
          if (
            dist > 0.45 &&
            (input.dimension === 'wardrobe' ||
              input.dimension === 'character' ||
              input.dimension === 'location')
          ) {
            score -= Math.min(0.35, (dist - 0.45) * 0.8);
            issues.push(
              `Visual embedding drift vs ${neighbor.code} (distance ${dist.toFixed(3)})`,
            );
          }
        }
      }
    }

    score = clamp01(Math.round(score * 1000) / 1000);

    return {
      shotId: input.shot.id,
      takeId: input.take?.id ?? null,
      dimension: input.dimension,
      score,
      details: {
        explanation:
          issues.length > 0
            ? issues.join(' · ')
            : `${input.dimension} continuity looks consistent`,
        issues,
        threshold: VIOLATION_THRESHOLD,
        violated: score < VIOLATION_THRESHOLD,
      },
      citations,
    };
  }

  private observeValue(
    input: {
      dna: Record<string, unknown>;
      character: typeof characters.$inferSelect | undefined;
      location: typeof locations.$inferSelect | undefined;
      shot: typeof shots.$inferSelect;
    },
    key: string,
    entityType: string,
  ): string | null {
    const k = key.toLowerCase();
    if (k.includes('wardrobe') || k.includes('costume')) {
      const costume = stringifyLoose(dnaPath(input.dna, ['subject', 'costumeId']));
      if (costume) return costume;
      if (input.character) {
        const wardrobe = asRecord(input.character.wardrobe);
        const first = Object.values(wardrobe)[0];
        if (first != null) return stringifyLoose(first);
      }
    }
    if (k.includes('light')) {
      return stringifyLoose(dnaPath(input.dna, ['lighting'])) || null;
    }
    if (k.includes('location') || entityType === 'location') {
      return (
        stringifyLoose(dnaPath(input.dna, ['environment', 'locationId'])) ||
        input.location?.name ||
        null
      );
    }
    if (k.includes('character') || entityType === 'character') {
      return input.shot.characterId || input.character?.name || null;
    }
    if (k.includes('prop')) {
      return stringifyLoose(dnaPath(input.dna, ['props'])) || null;
    }
    // Generic: try key as DNA path
    const direct = stringifyLoose(input.dna[key]);
    return direct || null;
  }

  private async sceneHeatmap(
    projectId: string,
    scores: (typeof continuityScores.$inferSelect)[],
  ) {
    if (scores.length === 0) return [];
    const shotIds = [...new Set(scores.map((s) => s.shotId))];
    const shotRows = await this.db.select().from(shots).where(inArray(shots.id, shotIds));
    const sceneIds = [...new Set(shotRows.map((s) => s.sceneId))];
    const sceneRows =
      sceneIds.length > 0
        ? await this.db
            .select()
            .from(scenes)
            .where(and(eq(scenes.projectId, projectId), inArray(scenes.id, sceneIds)))
        : [];

    const shotToScene = new Map(shotRows.map((s) => [s.id, s.sceneId]));
    const byScene = new Map<
      string,
      { sceneId: string; minScore: number; avgScore: number; count: number; violations: number }
    >();

    for (const score of scores) {
      const sceneId = shotToScene.get(score.shotId);
      if (!sceneId) continue;
      const cur = byScene.get(sceneId) ?? {
        sceneId,
        minScore: 1,
        avgScore: 0,
        count: 0,
        violations: 0,
      };
      cur.minScore = Math.min(cur.minScore, score.score);
      cur.avgScore += score.score;
      cur.count += 1;
      if (score.score < VIOLATION_THRESHOLD) cur.violations += 1;
      byScene.set(sceneId, cur);
    }

    return sceneRows
      .map((scene) => {
        const agg = byScene.get(scene.id);
        if (!agg) {
          return {
            sceneId: scene.id,
            number: scene.number,
            slug: scene.slug,
            heading: scene.heading,
            minScore: 1,
            avgScore: 1,
            violations: 0,
            scoreCount: 0,
          };
        }
        return {
          sceneId: scene.id,
          number: scene.number,
          slug: scene.slug,
          heading: scene.heading,
          minScore: Math.round(agg.minScore * 1000) / 1000,
          avgScore: Math.round((agg.avgScore / agg.count) * 1000) / 1000,
          violations: agg.violations,
          scoreCount: agg.count,
        };
      })
      .sort((a, b) => a.number - b.number);
  }
}

function embByAssetGet(map: Map<string, number[]>, assetId: string): number[] | null {
  return map.get(assetId) ?? null;
}

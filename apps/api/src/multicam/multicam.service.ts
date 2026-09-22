import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  masks,
  mattes,
  multicamAngles,
  multicamGroups,
  projects,
  rotoShapes,
  type Database,
  type RotoPoint,
} from '@studio-os/db';
import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { DB } from '../db/db.tokens.js';
import { GenerationService } from '../generation/generation.service.js';

type RotoShapeRow = typeof rotoShapes.$inferSelect;

const CreateGroupSchema = z.object({
  name: z.string().min(1).max(300),
  timelineId: z.string().uuid().optional(),
  syncOffsetSec: z.number().optional(),
});

const PatchGroupSchema = z.object({
  name: z.string().min(1).max(300).optional(),
  timelineId: z.string().uuid().nullable().optional(),
  activeAngleId: z.string().uuid().nullable().optional(),
  syncOffsetSec: z.number().optional(),
});

const CreateAngleSchema = z.object({
  name: z.string().min(1).max(200),
  label: z.string().max(40).optional(),
  assetId: z.string().uuid().optional(),
  sortOrder: z.number().int().optional(),
  offsetSec: z.number().optional(),
});

const PatchAngleSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  label: z.string().max(40).optional(),
  assetId: z.string().uuid().nullable().optional(),
  sortOrder: z.number().int().optional(),
  offsetSec: z.number().optional(),
});

const RotoPointSchema = z.object({
  x: z.number(),
  y: z.number(),
  handleIn: z.object({ x: z.number(), y: z.number() }).optional(),
  handleOut: z.object({ x: z.number(), y: z.number() }).optional(),
});

const CreateMaskSchema = z.object({
  name: z.string().min(1).max(300),
  timelineId: z.string().uuid().optional(),
  clipId: z.string().uuid().optional(),
  shapeType: z.string().optional(),
  parameters: z.record(z.unknown()).optional(),
  feather: z.number().optional(),
  inverted: z.boolean().optional(),
});

const CreateRotoSchema = z.object({
  name: z.string().min(1).max(300),
  maskId: z.string().uuid().optional(),
  clipId: z.string().uuid().optional(),
  points: z.array(RotoPointSchema).optional(),
  frameIn: z.number().int().optional(),
  frameOut: z.number().int().optional(),
  keyframes: z
    .array(
      z.object({
        frame: z.number().int(),
        points: z.array(RotoPointSchema),
      }),
    )
    .optional(),
});

const PatchRotoSchema = z.object({
  name: z.string().min(1).max(300).optional(),
  points: z.array(RotoPointSchema).optional(),
  frameIn: z.number().int().optional(),
  frameOut: z.number().int().optional(),
  keyframes: z
    .array(
      z.object({
        frame: z.number().int(),
        points: z.array(RotoPointSchema),
      }),
    )
    .optional(),
});

const CreateMatteSchema = z.object({
  rotoShapeId: z.string().uuid().optional(),
  maskId: z.string().uuid().optional(),
  prompt: z.string().optional(),
  workspaceId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
});

@Injectable()
export class MulticamService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(GenerationService) private readonly generation: GenerationService,
  ) {}

  async listGroups(projectId: string) {
    const groups = await this.db
      .select()
      .from(multicamGroups)
      .where(eq(multicamGroups.projectId, projectId))
      .orderBy(asc(multicamGroups.name));
    const angles = await this.db
      .select()
      .from(multicamAngles)
      .where(eq(multicamAngles.projectId, projectId))
      .orderBy(asc(multicamAngles.sortOrder));
    return groups.map((g) => ({
      ...g,
      angles: angles.filter((a) => a.groupId === g.id),
    }));
  }

  async createGroup(projectId: string, body: unknown) {
    const parsed = CreateGroupSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const [row] = await this.db
      .insert(multicamGroups)
      .values({
        projectId,
        name: parsed.data.name,
        timelineId: parsed.data.timelineId,
        syncOffsetSec: parsed.data.syncOffsetSec ?? 0,
      })
      .returning();
    return { ...row, angles: [] };
  }

  async getGroup(id: string) {
    const [group] = await this.db
      .select()
      .from(multicamGroups)
      .where(eq(multicamGroups.id, id))
      .limit(1);
    if (!group) throw new NotFoundException('Multicam group not found');
    const angles = await this.db
      .select()
      .from(multicamAngles)
      .where(eq(multicamAngles.groupId, id))
      .orderBy(asc(multicamAngles.sortOrder));
    return { ...group, angles };
  }

  async patchGroup(id: string, body: unknown) {
    const parsed = PatchGroupSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const [row] = await this.db
      .update(multicamGroups)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(multicamGroups.id, id))
      .returning();
    if (!row) throw new NotFoundException('Multicam group not found');
    return this.getGroup(id);
  }

  async createAngle(groupId: string, body: unknown) {
    const parsed = CreateAngleSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const group = await this.getGroup(groupId);
    const label =
      parsed.data.label ??
      String.fromCharCode(65 + Math.min(25, group.angles.length));
    const [row] = await this.db
      .insert(multicamAngles)
      .values({
        groupId,
        projectId: group.projectId,
        name: parsed.data.name,
        label,
        assetId: parsed.data.assetId,
        sortOrder: parsed.data.sortOrder ?? group.angles.length,
        offsetSec: parsed.data.offsetSec ?? 0,
      })
      .returning();
    if (!group.activeAngleId && row) {
      await this.db
        .update(multicamGroups)
        .set({ activeAngleId: row.id, updatedAt: new Date() })
        .where(eq(multicamGroups.id, groupId));
    }
    return row;
  }

  async patchAngle(id: string, body: unknown) {
    const parsed = PatchAngleSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const [row] = await this.db
      .update(multicamAngles)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(multicamAngles.id, id))
      .returning();
    if (!row) throw new NotFoundException('Multicam angle not found');
    return row;
  }

  async setActiveAngle(groupId: string, angleId: string) {
    const group = await this.getGroup(groupId);
    const angle = group.angles.find((a) => a.id === angleId);
    if (!angle) throw new NotFoundException('Angle not in group');
    const [row] = await this.db
      .update(multicamGroups)
      .set({ activeAngleId: angleId, updatedAt: new Date() })
      .where(eq(multicamGroups.id, groupId))
      .returning();
    return { ...row, angle };
  }

  async listMasks(projectId: string) {
    return this.db
      .select()
      .from(masks)
      .where(eq(masks.projectId, projectId))
      .orderBy(asc(masks.name));
  }

  async createMask(projectId: string, body: unknown) {
    const parsed = CreateMaskSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const [row] = await this.db
      .insert(masks)
      .values({
        projectId,
        name: parsed.data.name,
        timelineId: parsed.data.timelineId,
        clipId: parsed.data.clipId,
        shapeType: parsed.data.shapeType ?? 'bezier',
        parameters: parsed.data.parameters ?? {},
        feather: parsed.data.feather ?? 0,
        inverted: parsed.data.inverted ?? false,
      })
      .returning();
    return row;
  }

  async listRotoShapes(projectId: string) {
    return this.db
      .select()
      .from(rotoShapes)
      .where(eq(rotoShapes.projectId, projectId))
      .orderBy(asc(rotoShapes.name));
  }

  async createRotoShape(projectId: string, body: unknown) {
    const parsed = CreateRotoSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const [row] = await this.db
      .insert(rotoShapes)
      .values({
        projectId,
        name: parsed.data.name,
        maskId: parsed.data.maskId,
        clipId: parsed.data.clipId,
        points: (parsed.data.points ?? []) as RotoPoint[],
        frameIn: parsed.data.frameIn ?? 0,
        frameOut: parsed.data.frameOut ?? 24,
        keyframes: parsed.data.keyframes ?? [],
      })
      .returning();
    return row;
  }

  async patchRotoShape(id: string, body: unknown) {
    const parsed = PatchRotoSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const [row] = await this.db
      .update(rotoShapes)
      .set({
        ...parsed.data,
        points: parsed.data.points as RotoPoint[] | undefined,
        updatedAt: new Date(),
      })
      .where(eq(rotoShapes.id, id))
      .returning();
    if (!row) throw new NotFoundException('Roto shape not found');
    return row;
  }

  async listMattes(projectId: string) {
    return this.db
      .select()
      .from(mattes)
      .where(eq(mattes.projectId, projectId))
      .orderBy(asc(mattes.createdAt));
  }

  async createMatte(projectId: string, body: unknown, userId?: string) {
    const parsed = CreateMatteSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());

    const [project] = await this.db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    if (!project) throw new NotFoundException('Project not found');

    let shape: RotoShapeRow | null = null;
    if (parsed.data.rotoShapeId) {
      shape = await this.getRotoOrNull(parsed.data.rotoShapeId);
      if (!shape || shape.projectId !== projectId) {
        throw new NotFoundException('Roto shape not found');
      }
    }

    const actorId = userId ?? parsed.data.userId;
    if (!actorId) throw new BadRequestException('userId required for matte generation');

    const job = await this.generation.generate(actorId, {
      capability: 'video.matte',
      workspaceId: parsed.data.workspaceId ?? project.workspaceId,
      projectId,
      intent: {
        prompt:
          parsed.data.prompt ??
          `Generate matte from roto shape ${shape?.name ?? 'mask'} frames ${shape?.frameIn ?? 0}-${shape?.frameOut ?? 24}.`,
        parameters: {
          rotoShapeId: shape?.id,
          maskId: parsed.data.maskId ?? shape?.maskId,
          points: shape?.points ?? [],
          frameIn: shape?.frameIn,
          frameOut: shape?.frameOut,
          keyframes: shape?.keyframes ?? [],
        },
      },
      constraints: { qualityMode: 'balanced' },
    });

    const [row] = await this.db
      .insert(mattes)
      .values({
        projectId,
        rotoShapeId: shape?.id ?? parsed.data.rotoShapeId,
        maskId: parsed.data.maskId ?? shape?.maskId ?? undefined,
        jobId: job.id,
        status: 'pending',
        metadata: { capability: 'video.matte' },
      })
      .returning();

    return { matte: row, job };
  }

  private async getRotoOrNull(id: string) {
    const [row] = await this.db.select().from(rotoShapes).where(eq(rotoShapes.id, id)).limit(1);
    return row ?? null;
  }
}

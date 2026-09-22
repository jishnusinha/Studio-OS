import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  assetVersions,
  assets,
  clipColorState,
  colorGrades,
  colorScopes,
  looks,
  luts,
  projects,
  type ColorCurves,
  type ColorQualifiers,
  type ColorWheel,
  type Database,
} from '@studio-os/db';
import { and, asc, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { DB } from '../db/db.tokens.js';

const WheelSchema = z.object({
  r: z.number(),
  g: z.number(),
  b: z.number(),
});

const CreateGradeSchema = z.object({
  name: z.string().min(1).max(300),
  nodeGraph: z
    .object({
      nodes: z.array(z.record(z.unknown())).default([]),
      edges: z.array(z.record(z.unknown())).default([]),
    })
    .optional(),
  lookId: z.string().uuid().optional(),
  lutId: z.string().uuid().optional(),
});

const PatchGradeSchema = z.object({
  name: z.string().min(1).max(300).optional(),
  nodeGraph: z
    .object({
      nodes: z.array(z.record(z.unknown())),
      edges: z.array(z.record(z.unknown())),
    })
    .optional(),
  lookId: z.string().uuid().nullable().optional(),
  lutId: z.string().uuid().nullable().optional(),
  bumpVersion: z.boolean().optional(),
});

const CreateLutSchema = z.object({
  name: z.string().min(1).max(300),
  assetId: z.string().uuid().optional(),
  storageKey: z.string().optional(),
  format: z.string().optional(),
  size: z.number().int().optional(),
});

const CreateLookSchema = z.object({
  name: z.string().min(1).max(300),
  gradeId: z.string().uuid().optional(),
  lutId: z.string().uuid().optional(),
  parameters: z.record(z.unknown()).optional(),
});

const UpsertClipStateSchema = z.object({
  timelineId: z.string().uuid().optional(),
  clipId: z.string().uuid(),
  gradeId: z.string().uuid().optional(),
  lift: WheelSchema.optional(),
  gamma: WheelSchema.optional(),
  gain: WheelSchema.optional(),
  curves: z.record(z.array(z.tuple([z.number(), z.number()]))).optional(),
  qualifiers: z
    .object({
      hue: z.tuple([z.number(), z.number()]),
      saturation: z.tuple([z.number(), z.number()]),
      luminance: z.tuple([z.number(), z.number()]),
    })
    .optional(),
});

const AnalyzeScopesSchema = z.object({
  timelineId: z.string().uuid().optional(),
  clipId: z.string().uuid().optional(),
  assetId: z.string().uuid().optional(),
});

function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function stubWaveform(seed: number, bins = 64): number[] {
  const out: number[] = [];
  let s = seed || 1;
  for (let i = 0; i < bins; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const base = 0.15 + (i / bins) * 0.55;
    out.push(Math.min(1, base + ((s % 1000) / 1000) * 0.35));
  }
  return out;
}

function stubHistogram(seed: number, bins = 32): { r: number[]; g: number[]; b: number[]; y: number[] } {
  const channel = (offset: number) => {
    const out: number[] = [];
    let s = (seed + offset) >>> 0 || 1;
    for (let i = 0; i < bins; i++) {
      s = (s * 1664525 + 1013904223) >>> 0;
      const peak = Math.exp(-Math.pow((i - bins * 0.45) / (bins * 0.2), 2));
      out.push(peak * (0.4 + (s % 1000) / 1000));
    }
    return out;
  };
  return { r: channel(1), g: channel(2), b: channel(3), y: channel(4) };
}

function stubVectorscope(seed: number, points = 48): Array<{ u: number; v: number; w: number }> {
  const out: Array<{ u: number; v: number; w: number }> = [];
  let s = seed || 1;
  for (let i = 0; i < points; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const a = (i / points) * Math.PI * 2;
    const r = 0.15 + ((s % 1000) / 1000) * 0.55;
    out.push({
      u: Math.cos(a) * r,
      v: Math.sin(a) * r,
      w: 0.2 + ((s % 500) / 500) * 0.8,
    });
  }
  return out;
}

@Injectable()
export class ColorService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async listGrades(projectId: string) {
    return this.db
      .select()
      .from(colorGrades)
      .where(eq(colorGrades.projectId, projectId))
      .orderBy(desc(colorGrades.updatedAt));
  }

  async createGrade(projectId: string, body: unknown) {
    const parsed = CreateGradeSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const [row] = await this.db
      .insert(colorGrades)
      .values({
        projectId,
        name: parsed.data.name,
        nodeGraph: parsed.data.nodeGraph ?? { nodes: [], edges: [] },
        lookId: parsed.data.lookId,
        lutId: parsed.data.lutId,
      })
      .returning();
    return row;
  }

  async getGrade(id: string) {
    const [row] = await this.db.select().from(colorGrades).where(eq(colorGrades.id, id)).limit(1);
    if (!row) throw new NotFoundException('Color grade not found');
    return row;
  }

  async patchGrade(id: string, body: unknown) {
    const parsed = PatchGradeSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const existing = await this.getGrade(id);
    const { bumpVersion, ...rest } = parsed.data;
    const [row] = await this.db
      .update(colorGrades)
      .set({
        ...rest,
        version: bumpVersion ? existing.version + 1 : existing.version,
        updatedAt: new Date(),
      })
      .where(eq(colorGrades.id, id))
      .returning();
    return row;
  }

  async listLuts(projectId: string) {
    return this.db.select().from(luts).where(eq(luts.projectId, projectId)).orderBy(asc(luts.name));
  }

  async createLut(projectId: string, body: unknown) {
    const parsed = CreateLutSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const [row] = await this.db
      .insert(luts)
      .values({
        projectId,
        name: parsed.data.name,
        assetId: parsed.data.assetId,
        storageKey: parsed.data.storageKey,
        format: parsed.data.format ?? 'cube',
        size: parsed.data.size,
      })
      .returning();
    return row;
  }

  async listLooks(projectId: string) {
    return this.db.select().from(looks).where(eq(looks.projectId, projectId)).orderBy(asc(looks.name));
  }

  async createLook(projectId: string, body: unknown) {
    const parsed = CreateLookSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const [row] = await this.db
      .insert(looks)
      .values({
        projectId,
        name: parsed.data.name,
        gradeId: parsed.data.gradeId,
        lutId: parsed.data.lutId,
        parameters: parsed.data.parameters ?? {},
      })
      .returning();
    return row;
  }

  async listClipStates(projectId: string, timelineId?: string) {
    const cond = timelineId
      ? and(eq(clipColorState.projectId, projectId), eq(clipColorState.timelineId, timelineId))
      : eq(clipColorState.projectId, projectId);
    return this.db.select().from(clipColorState).where(cond).orderBy(desc(clipColorState.updatedAt));
  }

  async getClipState(projectId: string, clipId: string) {
    const [row] = await this.db
      .select()
      .from(clipColorState)
      .where(and(eq(clipColorState.projectId, projectId), eq(clipColorState.clipId, clipId)))
      .limit(1);
    return row ?? null;
  }

  async upsertClipState(projectId: string, body: unknown) {
    const parsed = UpsertClipStateSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());

    const existing = await this.getClipState(projectId, parsed.data.clipId);
    const lift = (parsed.data.lift ?? existing?.lift ?? { r: 0, g: 0, b: 0 }) as ColorWheel;
    const gamma = (parsed.data.gamma ?? existing?.gamma ?? { r: 1, g: 1, b: 1 }) as ColorWheel;
    const gain = (parsed.data.gain ?? existing?.gain ?? { r: 1, g: 1, b: 1 }) as ColorWheel;
    const curves = (parsed.data.curves ??
      existing?.curves ?? { master: [[0, 0], [1, 1]] }) as ColorCurves;
    const qualifiers = (parsed.data.qualifiers ??
      existing?.qualifiers ?? {
        hue: [0, 360],
        saturation: [0, 1],
        luminance: [0, 1],
      }) as ColorQualifiers;

    if (existing) {
      const [row] = await this.db
        .update(clipColorState)
        .set({
          timelineId: parsed.data.timelineId ?? existing.timelineId,
          gradeId: parsed.data.gradeId ?? existing.gradeId,
          lift,
          gamma,
          gain,
          curves,
          qualifiers,
          updatedAt: new Date(),
        })
        .where(eq(clipColorState.id, existing.id))
        .returning();
      return row;
    }

    const [row] = await this.db
      .insert(clipColorState)
      .values({
        projectId,
        timelineId: parsed.data.timelineId,
        clipId: parsed.data.clipId,
        gradeId: parsed.data.gradeId,
        lift,
        gamma,
        gain,
        curves,
        qualifiers,
      })
      .returning();
    return row;
  }

  /**
   * Scope analysis stub: samples proxy / asset-version metadata and synthesizes
   * waveform, vectorscope, and histogram placeholder series for the UI.
   */
  async analyzeScopes(projectId: string, body: unknown) {
    const parsed = AnalyzeScopesSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());

    const [project] = await this.db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    if (!project) throw new NotFoundException('Project not found');

    let assetId = parsed.data.assetId;
    let proxyMeta: Record<string, unknown> = {};
    let width = 1920;
    let height = 1080;
    let durationSec: number | null = null;
    let fps: number | null = null;

    if (!assetId) {
      const [firstAsset] = await this.db
        .select()
        .from(assets)
        .where(and(eq(assets.projectId, projectId), eq(assets.type, 'video')))
        .orderBy(desc(assets.updatedAt))
        .limit(1);
      assetId = firstAsset?.id;
      if (firstAsset?.metadata) proxyMeta = firstAsset.metadata as Record<string, unknown>;
    }

    if (assetId) {
      const [ver] = await this.db
        .select()
        .from(assetVersions)
        .where(eq(assetVersions.assetId, assetId))
        .orderBy(desc(assetVersions.version))
        .limit(1);
      if (ver) {
        width = ver.width ?? width;
        height = ver.height ?? height;
        durationSec = ver.durationSec ?? null;
        fps = ver.fps ?? null;
        proxyMeta = {
          ...proxyMeta,
          ...(ver.metadata ?? {}),
          proxyKey: ver.proxyKey,
          thumbnailKey: ver.thumbnailKey,
          width,
          height,
          durationSec,
          fps,
        };
      } else {
        const [asset] = await this.db.select().from(assets).where(eq(assets.id, assetId)).limit(1);
        if (asset?.metadata) proxyMeta = { ...proxyMeta, ...asset.metadata };
      }
    }

    const seed = hashSeed(`${projectId}:${assetId ?? 'none'}:${parsed.data.clipId ?? ''}`);
    const scopes = {
      waveform: {
        luma: stubWaveform(seed),
        rgb: {
          r: stubWaveform(seed + 11),
          g: stubWaveform(seed + 22),
          b: stubWaveform(seed + 33),
        },
      },
      vectorscope: { points: stubVectorscope(seed + 7) },
      histogram: stubHistogram(seed + 13),
      proxy: {
        assetId: assetId ?? null,
        width,
        height,
        durationSec,
        fps,
        metadata: proxyMeta,
      },
    };

    const rows = [];
    for (const scopeType of ['waveform', 'vectorscope', 'histogram'] as const) {
      const data =
        scopeType === 'waveform'
          ? scopes.waveform
          : scopeType === 'vectorscope'
            ? scopes.vectorscope
            : scopes.histogram;
      const [row] = await this.db
        .insert(colorScopes)
        .values({
          projectId,
          timelineId: parsed.data.timelineId,
          clipId: parsed.data.clipId,
          assetId: assetId ?? undefined,
          scopeType,
          data: data as Record<string, unknown>,
          metadata: { stub: true, proxy: scopes.proxy },
          sampledAt: new Date(),
        })
        .returning();
      if (row) rows.push(row);
    }

    return { scopes, snapshots: rows };
  }

  async listScopes(projectId: string) {
    return this.db
      .select()
      .from(colorScopes)
      .where(eq(colorScopes.projectId, projectId))
      .orderBy(desc(colorScopes.sampledAt))
      .limit(30);
  }
}

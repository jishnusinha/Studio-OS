import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  adrSessions,
  adrTakes,
  audioMixBuses,
  audioStems,
  characters,
  dialogueLines,
  dubbingTracks,
  projects,
  scripts,
  scriptVersions,
  type Database,
} from '@studio-os/db';
import { and, asc, desc, eq, max } from 'drizzle-orm';
import { z } from 'zod';
import { DB } from '../db/db.tokens.js';
import { GenerationService } from '../generation/generation.service.js';

const CHARACTER_CUE = /^([A-Z][A-Z0-9 \-'.]{1,40})(\s*\(.*\))?$/;

function isCharacterCue(line: string): boolean {
  const t = line.trim();
  if (!t || t.length > 40) return false;
  if (/^(INT|EXT|EST|FADE|CUT|SMASH|DISSOLVE|TITLE)/i.test(t)) return false;
  const bare = t.replace(/\s*\(.*\)\s*$/, '').trim();
  return CHARACTER_CUE.test(t) && bare.split(/\s+/).length <= 4;
}

function extractDialogueFromText(content: string): Array<{ speaker: string | null; text: string }> {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const out: Array<{ speaker: string | null; text: string }> = [];
  let speaker: string | null = null;
  const buf: string[] = [];

  const flush = () => {
    const text = buf.join(' ').replace(/\s+/g, ' ').trim();
    if (text && speaker) {
      out.push({ speaker, text });
    }
    buf.length = 0;
  };

  for (const raw of lines) {
    const trimmed = raw.trim();
    if (!trimmed) {
      flush();
      speaker = null;
      continue;
    }
    if (/^(INT|EXT|EST|I\/E|E\/I)[\.\s]/i.test(trimmed) || trimmed.startsWith('.')) {
      flush();
      speaker = null;
      continue;
    }
    if (isCharacterCue(trimmed)) {
      flush();
      speaker = trimmed.replace(/\s*\(.*\)\s*$/, '').trim();
      continue;
    }
    if (trimmed.startsWith('(') && trimmed.endsWith(')')) continue;
    if (speaker) buf.push(trimmed);
  }
  flush();
  return out;
}

const ExtractDialogueSchema = z.object({
  scriptVersionId: z.string().uuid().optional(),
  replace: z.boolean().optional().default(true),
});

const PatchDialogueSchema = z.object({
  text: z.string().min(1).optional(),
  speaker: z.string().nullable().optional(),
  startSec: z.number().nullable().optional(),
  endSec: z.number().nullable().optional(),
  status: z.string().optional(),
  characterId: z.string().uuid().nullable().optional(),
});

const CreateAdrSessionSchema = z.object({
  name: z.string().min(1).max(300),
  dialogueLineId: z.string().uuid().optional(),
  sceneId: z.string().uuid().optional(),
  characterId: z.string().uuid().optional(),
  loopInSec: z.number().optional(),
  loopOutSec: z.number().optional(),
});

const CreateAdrTakeSchema = z.object({
  assetId: z.string().uuid().optional(),
  notes: z.string().optional(),
  rating: z.number().int().min(1).max(5).optional(),
  selected: z.boolean().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const PatchAdrTakeSchema = z.object({
  rating: z.number().int().min(1).max(5).nullable().optional(),
  selected: z.boolean().optional(),
  status: z.string().optional(),
  notes: z.string().nullable().optional(),
  assetId: z.string().uuid().nullable().optional(),
});

const StemSplitSchema = z.object({
  assetId: z.string().uuid(),
  prompt: z.string().optional(),
  workspaceId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
});

const CreateMixBusSchema = z.object({
  name: z.string().min(1).max(200),
  busType: z.string().optional(),
  gainDb: z.number().optional(),
  pan: z.number().min(-1).max(1).optional(),
  assetId: z.string().uuid().optional(),
  sortOrder: z.number().int().optional(),
});

const PatchMixBusSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  gainDb: z.number().optional(),
  pan: z.number().min(-1).max(1).optional(),
  muted: z.boolean().optional(),
  solo: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  assetId: z.string().uuid().nullable().optional(),
});

const CreateDubbingSchema = z.object({
  language: z.string().min(1).max(40),
  dialogueLineId: z.string().uuid().optional(),
  assetId: z.string().uuid().optional(),
  variantLabel: z.string().optional(),
  lipSyncDriftMs: z.number().optional(),
});

const PatchDubbingSchema = z.object({
  language: z.string().min(1).max(40).optional(),
  lipSyncDriftMs: z.number().nullable().optional(),
  status: z.string().optional(),
  variantLabel: z.string().nullable().optional(),
  assetId: z.string().uuid().nullable().optional(),
});

@Injectable()
export class AudioService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(GenerationService) private readonly generation: GenerationService,
  ) {}

  async listDialogue(projectId: string) {
    return this.db
      .select()
      .from(dialogueLines)
      .where(eq(dialogueLines.projectId, projectId))
      .orderBy(asc(dialogueLines.lineIndex));
  }

  async extractDialogue(projectId: string, body: unknown) {
    const parsed = ExtractDialogueSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());

    let versionId = parsed.data.scriptVersionId;
    let content: string | null = null;

    if (versionId) {
      const [ver] = await this.db
        .select()
        .from(scriptVersions)
        .where(eq(scriptVersions.id, versionId))
        .limit(1);
      if (!ver) throw new NotFoundException('Script version not found');
      content = ver.content;
    } else {
      const [script] = await this.db
        .select()
        .from(scripts)
        .where(eq(scripts.projectId, projectId))
        .orderBy(desc(scripts.updatedAt))
        .limit(1);
      if (!script) throw new NotFoundException('No script for project');
      const [ver] = await this.db
        .select()
        .from(scriptVersions)
        .where(eq(scriptVersions.scriptId, script.id))
        .orderBy(desc(scriptVersions.version))
        .limit(1);
      if (!ver) throw new NotFoundException('No script version');
      versionId = ver.id;
      content = ver.content;
    }

    const chars = await this.db
      .select()
      .from(characters)
      .where(eq(characters.projectId, projectId));
    const charByName = new Map(chars.map((c) => [c.name.toUpperCase(), c.id]));

    const extracted = extractDialogueFromText(content ?? '');
    if (parsed.data.replace) {
      await this.db
        .delete(dialogueLines)
        .where(
          and(
            eq(dialogueLines.projectId, projectId),
            eq(dialogueLines.scriptVersionId, versionId!),
          ),
        );
    }

    const rows = [];
    for (let i = 0; i < extracted.length; i++) {
      const line = extracted[i]!;
      const [row] = await this.db
        .insert(dialogueLines)
        .values({
          projectId,
          scriptVersionId: versionId!,
          speaker: line.speaker,
          text: line.text,
          lineIndex: i,
          characterId: line.speaker ? (charByName.get(line.speaker.toUpperCase()) ?? null) : null,
          startSec: i * 3,
          endSec: i * 3 + 2.5,
        })
        .returning();
      if (row) rows.push(row);
    }

    return { scriptVersionId: versionId, count: rows.length, lines: rows };
  }

  async patchDialogueLine(id: string, body: unknown) {
    const parsed = PatchDialogueSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const [row] = await this.db
      .update(dialogueLines)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(dialogueLines.id, id))
      .returning();
    if (!row) throw new NotFoundException('Dialogue line not found');
    return row;
  }

  async listAdrSessions(projectId: string) {
    return this.db
      .select()
      .from(adrSessions)
      .where(eq(adrSessions.projectId, projectId))
      .orderBy(desc(adrSessions.createdAt));
  }

  async createAdrSession(projectId: string, body: unknown) {
    const parsed = CreateAdrSessionSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const [row] = await this.db
      .insert(adrSessions)
      .values({
        projectId,
        name: parsed.data.name,
        dialogueLineId: parsed.data.dialogueLineId,
        sceneId: parsed.data.sceneId,
        characterId: parsed.data.characterId,
        loopInSec: parsed.data.loopInSec,
        loopOutSec: parsed.data.loopOutSec,
      })
      .returning();
    return row;
  }

  async getAdrSession(id: string) {
    const [session] = await this.db
      .select()
      .from(adrSessions)
      .where(eq(adrSessions.id, id))
      .limit(1);
    if (!session) throw new NotFoundException('ADR session not found');
    const takes = await this.db
      .select()
      .from(adrTakes)
      .where(eq(adrTakes.sessionId, id))
      .orderBy(asc(adrTakes.number));
    return { ...session, takes };
  }

  async createAdrTake(sessionId: string, body: unknown) {
    const parsed = CreateAdrTakeSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const [session] = await this.db
      .select()
      .from(adrSessions)
      .where(eq(adrSessions.id, sessionId))
      .limit(1);
    if (!session) throw new NotFoundException('ADR session not found');

    const [agg] = await this.db
      .select({ maxNum: max(adrTakes.number) })
      .from(adrTakes)
      .where(eq(adrTakes.sessionId, sessionId));
    const number = (agg?.maxNum ?? 0) + 1;

    const [row] = await this.db
      .insert(adrTakes)
      .values({
        sessionId,
        projectId: session.projectId,
        number,
        assetId: parsed.data.assetId,
        notes: parsed.data.notes,
        rating: parsed.data.rating,
        selected: parsed.data.selected ?? false,
        metadata: parsed.data.metadata ?? {},
      })
      .returning();
    return row;
  }

  async patchAdrTake(id: string, body: unknown) {
    const parsed = PatchAdrTakeSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());

    if (parsed.data.selected === true) {
      const [take] = await this.db.select().from(adrTakes).where(eq(adrTakes.id, id)).limit(1);
      if (!take) throw new NotFoundException('ADR take not found');
      await this.db
        .update(adrTakes)
        .set({ selected: false })
        .where(eq(adrTakes.sessionId, take.sessionId));
    }

    const [row] = await this.db
      .update(adrTakes)
      .set(parsed.data)
      .where(eq(adrTakes.id, id))
      .returning();
    if (!row) throw new NotFoundException('ADR take not found');
    return row;
  }

  async listStems(projectId: string) {
    return this.db
      .select()
      .from(audioStems)
      .where(eq(audioStems.projectId, projectId))
      .orderBy(asc(audioStems.sortOrder));
  }

  async stemSplit(projectId: string, body: unknown, userId?: string) {
    const parsed = StemSplitSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());

    const [project] = await this.db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    if (!project) throw new NotFoundException('Project not found');

    const actorId = userId ?? parsed.data.userId;
    if (!actorId) throw new BadRequestException('userId required for stem split');

    const job = await this.generation.generate(actorId, {
      capability: 'audio.stem_split',
      workspaceId: parsed.data.workspaceId ?? project.workspaceId,
      projectId,
      intent: {
        prompt: parsed.data.prompt ?? 'Split mix into stems (vocals, drums, bass, other).',
        parameters: { sourceAssetId: parsed.data.assetId },
      },
      constraints: { qualityMode: 'balanced' },
      parentAssetIds: [parsed.data.assetId],
    });

    const stemTypes = ['vocals', 'drums', 'bass', 'other'] as const;
    const stems = [];
    for (let i = 0; i < stemTypes.length; i++) {
      const [stem] = await this.db
        .insert(audioStems)
        .values({
          projectId,
          sourceAssetId: parsed.data.assetId,
          jobId: job.id,
          stemType: stemTypes[i],
          label: stemTypes[i],
          sortOrder: i,
          status: 'pending',
        })
        .returning();
      if (stem) stems.push(stem);
    }

    return { job, stems };
  }

  async listMixBuses(projectId: string) {
    return this.db
      .select()
      .from(audioMixBuses)
      .where(eq(audioMixBuses.projectId, projectId))
      .orderBy(asc(audioMixBuses.sortOrder));
  }

  async createMixBus(projectId: string, body: unknown) {
    const parsed = CreateMixBusSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const [row] = await this.db
      .insert(audioMixBuses)
      .values({
        projectId,
        name: parsed.data.name,
        busType: parsed.data.busType ?? 'bus',
        gainDb: parsed.data.gainDb ?? 0,
        pan: parsed.data.pan ?? 0,
        assetId: parsed.data.assetId,
        sortOrder: parsed.data.sortOrder ?? 0,
      })
      .returning();
    return row;
  }

  async patchMixBus(id: string, body: unknown) {
    const parsed = PatchMixBusSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const [row] = await this.db
      .update(audioMixBuses)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(audioMixBuses.id, id))
      .returning();
    if (!row) throw new NotFoundException('Mix bus not found');
    return row;
  }

  async listDubbing(projectId: string) {
    return this.db
      .select()
      .from(dubbingTracks)
      .where(eq(dubbingTracks.projectId, projectId))
      .orderBy(asc(dubbingTracks.language));
  }

  async createDubbing(projectId: string, body: unknown) {
    const parsed = CreateDubbingSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    // Placeholder lip-sync drift metric when not provided
    const drift =
      parsed.data.lipSyncDriftMs ??
      Math.round((Math.sin(parsed.data.language.length * 1.7) * 40 + 12) * 10) / 10;
    const [row] = await this.db
      .insert(dubbingTracks)
      .values({
        projectId,
        language: parsed.data.language,
        dialogueLineId: parsed.data.dialogueLineId,
        assetId: parsed.data.assetId,
        variantLabel: parsed.data.variantLabel,
        lipSyncDriftMs: drift,
      })
      .returning();
    return row;
  }

  async patchDubbing(id: string, body: unknown) {
    const parsed = PatchDubbingSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const [row] = await this.db
      .update(dubbingTracks)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(dubbingTracks.id, id))
      .returning();
    if (!row) throw new NotFoundException('Dubbing track not found');
    return row;
  }
}

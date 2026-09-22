import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  midiClips,
  midiEvents,
  musicStems,
  projects,
  scoreCues,
  scoreMarkers,
  tempoMaps,
  timelines,
  type Database,
} from '@studio-os/db';
import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { DB } from '../db/db.tokens.js';
import { GenerationService } from '../generation/generation.service.js';

const CreateMidiClipSchema = z.object({
  name: z.string().min(1).max(300),
  timelineId: z.string().uuid().optional(),
  startSec: z.number().optional(),
  durationSec: z.number().positive().optional(),
  channel: z.number().int().optional(),
  instrument: z.string().optional(),
});

const PatchMidiClipSchema = z.object({
  name: z.string().min(1).max(300).optional(),
  startSec: z.number().optional(),
  durationSec: z.number().positive().optional(),
  channel: z.number().int().optional(),
  instrument: z.string().nullable().optional(),
  status: z.string().optional(),
});

const UpsertMidiEventSchema = z.object({
  timeSec: z.number().nonnegative(),
  durationSec: z.number().positive().optional(),
  note: z.number().int().min(0).max(127),
  velocity: z.number().int().min(1).max(127).optional(),
  eventType: z.string().optional(),
  channel: z.number().int().optional(),
});

const GenerateMidiSchema = z.object({
  prompt: z.string().optional(),
  name: z.string().optional(),
  timelineId: z.string().uuid().optional(),
  durationSec: z.number().positive().optional(),
  workspaceId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
});

const CreateScoreCueSchema = z.object({
  name: z.string().min(1).max(300),
  timeSec: z.number().nonnegative(),
  cueType: z.string().optional(),
  description: z.string().optional(),
  timelineId: z.string().uuid().optional(),
});

const PatchScoreCueSchema = z.object({
  name: z.string().min(1).max(300).optional(),
  timeSec: z.number().nonnegative().optional(),
  cueType: z.string().optional(),
  description: z.string().nullable().optional(),
});

const CreateTempoMapSchema = z.object({
  name: z.string().optional(),
  bpm: z.number().positive().optional(),
  timeSignature: z.string().optional(),
  startSec: z.number().optional(),
  timelineId: z.string().uuid().optional(),
  points: z.array(z.unknown()).optional(),
});

const PatchTempoMapSchema = z.object({
  name: z.string().optional(),
  bpm: z.number().positive().optional(),
  timeSignature: z.string().optional(),
  startSec: z.number().optional(),
  points: z.array(z.unknown()).optional(),
});

const CreateMusicStemSchema = z.object({
  name: z.string().min(1).max(200),
  assetId: z.string().uuid().optional(),
  stemType: z.string().optional(),
  gainDb: z.number().optional(),
  pan: z.number().min(-1).max(1).optional(),
  sortOrder: z.number().int().optional(),
});

const PatchMusicStemSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  muted: z.boolean().optional(),
  solo: z.boolean().optional(),
  gainDb: z.number().optional(),
  pan: z.number().min(-1).max(1).optional(),
  sortOrder: z.number().int().optional(),
  assetId: z.string().uuid().nullable().optional(),
});

const CreateScoreMarkerSchema = z.object({
  timelineId: z.string().uuid(),
  timeSec: z.number().nonnegative(),
  label: z.string().min(1).max(200),
  color: z.string().optional(),
  kind: z.string().optional(),
});

const PromoteMarkersSchema = z.object({
  timelineId: z.string().uuid(),
});

@Injectable()
export class MusicService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(GenerationService) private readonly generation: GenerationService,
  ) {}

  async listMidiClips(projectId: string) {
    return this.db
      .select()
      .from(midiClips)
      .where(eq(midiClips.projectId, projectId))
      .orderBy(asc(midiClips.startSec));
  }

  async createMidiClip(projectId: string, body: unknown) {
    const parsed = CreateMidiClipSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const [row] = await this.db
      .insert(midiClips)
      .values({
        projectId,
        name: parsed.data.name,
        timelineId: parsed.data.timelineId,
        startSec: parsed.data.startSec ?? 0,
        durationSec: parsed.data.durationSec ?? 4,
        channel: parsed.data.channel ?? 0,
        instrument: parsed.data.instrument,
      })
      .returning();
    return row;
  }

  async getMidiClip(id: string) {
    const [clip] = await this.db.select().from(midiClips).where(eq(midiClips.id, id)).limit(1);
    if (!clip) throw new NotFoundException('MIDI clip not found');
    const events = await this.db
      .select()
      .from(midiEvents)
      .where(eq(midiEvents.clipId, id))
      .orderBy(asc(midiEvents.timeSec), asc(midiEvents.note));
    return { ...clip, events };
  }

  async patchMidiClip(id: string, body: unknown) {
    const parsed = PatchMidiClipSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const [row] = await this.db
      .update(midiClips)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(midiClips.id, id))
      .returning();
    if (!row) throw new NotFoundException('MIDI clip not found');
    return row;
  }

  async addMidiEvent(clipId: string, body: unknown) {
    const parsed = UpsertMidiEventSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const [clip] = await this.db.select().from(midiClips).where(eq(midiClips.id, clipId)).limit(1);
    if (!clip) throw new NotFoundException('MIDI clip not found');
    const [row] = await this.db
      .insert(midiEvents)
      .values({
        clipId,
        projectId: clip.projectId,
        timeSec: parsed.data.timeSec,
        durationSec: parsed.data.durationSec ?? 0.25,
        note: parsed.data.note,
        velocity: parsed.data.velocity ?? 80,
        eventType: parsed.data.eventType ?? 'note',
        channel: parsed.data.channel ?? clip.channel,
      })
      .returning();
    return row;
  }

  async deleteMidiEvent(eventId: string) {
    const [row] = await this.db.delete(midiEvents).where(eq(midiEvents.id, eventId)).returning();
    if (!row) throw new NotFoundException('MIDI event not found');
    return { ok: true, id: eventId };
  }

  async generateMidi(projectId: string, body: unknown, userId?: string) {
    const parsed = GenerateMidiSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());

    const [project] = await this.db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    if (!project) throw new NotFoundException('Project not found');

    const actorId = userId ?? parsed.data.userId;
    if (!actorId) throw new BadRequestException('userId required for MIDI generate');

    const durationSec = parsed.data.durationSec ?? 4;
    const prompt = parsed.data.prompt ?? 'Generate a simple motif in C major.';

    const job = await this.generation.generate(actorId, {
      capability: 'music.midi',
      workspaceId: parsed.data.workspaceId ?? project.workspaceId,
      projectId,
      intent: {
        prompt,
        parameters: { durationSec },
      },
      constraints: { qualityMode: 'balanced' },
    });

    const [clip] = await this.db
      .insert(midiClips)
      .values({
        projectId,
        name: parsed.data.name ?? 'Generated motif',
        timelineId: parsed.data.timelineId,
        durationSec,
        jobId: job.id,
        status: 'generating',
        instrument: 'piano',
      })
      .returning();

    // Seed a simple C-major arpeggio grid so the piano roll is immediately usable
    if (clip) {
      const pattern = [60, 64, 67, 72, 67, 64, 60, 55];
      for (let i = 0; i < pattern.length; i++) {
        await this.db.insert(midiEvents).values({
          clipId: clip.id,
          projectId,
          timeSec: (i * durationSec) / pattern.length,
          durationSec: durationSec / pattern.length - 0.02,
          note: pattern[i]!,
          velocity: 70 + (i % 3) * 10,
        });
      }
    }

    return { job, clip };
  }

  async listScoreCues(projectId: string) {
    return this.db
      .select()
      .from(scoreCues)
      .where(eq(scoreCues.projectId, projectId))
      .orderBy(asc(scoreCues.timeSec));
  }

  async createScoreCue(projectId: string, body: unknown) {
    const parsed = CreateScoreCueSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const [row] = await this.db
      .insert(scoreCues)
      .values({
        projectId,
        name: parsed.data.name,
        timeSec: parsed.data.timeSec,
        cueType: parsed.data.cueType ?? 'hit',
        description: parsed.data.description,
        timelineId: parsed.data.timelineId,
      })
      .returning();
    return row;
  }

  async patchScoreCue(id: string, body: unknown) {
    const parsed = PatchScoreCueSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const [row] = await this.db
      .update(scoreCues)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(scoreCues.id, id))
      .returning();
    if (!row) throw new NotFoundException('Score cue not found');
    return row;
  }

  async listTempoMaps(projectId: string) {
    return this.db
      .select()
      .from(tempoMaps)
      .where(eq(tempoMaps.projectId, projectId))
      .orderBy(asc(tempoMaps.startSec));
  }

  async createTempoMap(projectId: string, body: unknown) {
    const parsed = CreateTempoMapSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const [row] = await this.db
      .insert(tempoMaps)
      .values({
        projectId,
        name: parsed.data.name ?? 'Tempo',
        bpm: parsed.data.bpm ?? 120,
        timeSignature: parsed.data.timeSignature ?? '4/4',
        startSec: parsed.data.startSec ?? 0,
        timelineId: parsed.data.timelineId,
        points: parsed.data.points ?? [],
      })
      .returning();
    return row;
  }

  async patchTempoMap(id: string, body: unknown) {
    const parsed = PatchTempoMapSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const [row] = await this.db
      .update(tempoMaps)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(tempoMaps.id, id))
      .returning();
    if (!row) throw new NotFoundException('Tempo map not found');
    return row;
  }

  async listMusicStems(projectId: string) {
    return this.db
      .select()
      .from(musicStems)
      .where(eq(musicStems.projectId, projectId))
      .orderBy(asc(musicStems.sortOrder));
  }

  async createMusicStem(projectId: string, body: unknown) {
    const parsed = CreateMusicStemSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const [row] = await this.db
      .insert(musicStems)
      .values({
        projectId,
        name: parsed.data.name,
        assetId: parsed.data.assetId,
        stemType: parsed.data.stemType ?? 'mix',
        gainDb: parsed.data.gainDb ?? 0,
        pan: parsed.data.pan ?? 0,
        sortOrder: parsed.data.sortOrder ?? 0,
      })
      .returning();
    return row;
  }

  async patchMusicStem(id: string, body: unknown) {
    const parsed = PatchMusicStemSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const [row] = await this.db
      .update(musicStems)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(musicStems.id, id))
      .returning();
    if (!row) throw new NotFoundException('Music stem not found');
    return row;
  }

  async listScoreMarkers(projectId: string, timelineId?: string) {
    if (timelineId) {
      return this.db
        .select()
        .from(scoreMarkers)
        .where(
          and(eq(scoreMarkers.projectId, projectId), eq(scoreMarkers.timelineId, timelineId)),
        )
        .orderBy(asc(scoreMarkers.timeSec));
    }
    return this.db
      .select()
      .from(scoreMarkers)
      .where(eq(scoreMarkers.projectId, projectId))
      .orderBy(asc(scoreMarkers.timeSec));
  }

  async createScoreMarker(projectId: string, body: unknown) {
    const parsed = CreateScoreMarkerSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const [row] = await this.db
      .insert(scoreMarkers)
      .values({
        projectId,
        timelineId: parsed.data.timelineId,
        timeSec: parsed.data.timeSec,
        label: parsed.data.label,
        color: parsed.data.color,
        kind: parsed.data.kind ?? 'score',
      })
      .returning();
    return row;
  }

  /** Promote markers from timelines.data into queryable score_markers rows */
  async promoteMarkersFromTimeline(projectId: string, body: unknown) {
    const parsed = PromoteMarkersSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());

    const [tl] = await this.db
      .select()
      .from(timelines)
      .where(and(eq(timelines.id, parsed.data.timelineId), eq(timelines.projectId, projectId)))
      .limit(1);
    if (!tl) throw new NotFoundException('Timeline not found');

    const data = (tl.data ?? {}) as { markers?: Array<{ id?: string; time: number; label: string; color?: string }> };
    const markers = Array.isArray(data.markers) ? data.markers : [];

    await this.db
      .delete(scoreMarkers)
      .where(
        and(
          eq(scoreMarkers.projectId, projectId),
          eq(scoreMarkers.timelineId, parsed.data.timelineId),
          eq(scoreMarkers.kind, 'promoted'),
        ),
      );

    const rows = [];
    for (const m of markers) {
      const [row] = await this.db
        .insert(scoreMarkers)
        .values({
          id: m.id && /^[0-9a-f-]{36}$/i.test(m.id) ? m.id : undefined,
          projectId,
          timelineId: parsed.data.timelineId,
          timeSec: m.time,
          label: m.label,
          color: m.color,
          kind: 'promoted',
          metadata: { source: 'timelines.data' },
        })
        .returning();
      if (row) rows.push(row);
    }

    return { count: rows.length, markers: rows };
  }
}

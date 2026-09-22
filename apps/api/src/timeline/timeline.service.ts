import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  TimelineCommandSchema,
  type Timeline,
  type TimelineCommand,
} from '@studio-os/contracts';
import {
  assetVersions,
  deliverables,
  projects,
  timelines,
  type Database,
} from '@studio-os/db';
import {
  TimelineEngine,
  buildGenerateIntoGapContext,
  findGaps,
  neighborsForGap,
} from '@studio-os/timeline';
import { desc, eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { DB } from '../db/db.tokens.js';
import { GenerationService } from '../generation/generation.service.js';
import { RenderQueueService } from '../queue/render-queue.service.js';

const CreateTimelineSchema = z.object({
  name: z.string().min(1).max(300),
  fps: z.number().positive().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});

const RenderSchema = z.object({
  name: z.string().min(1).optional(),
  preset: z.string().min(1).default('16:9'),
});

const GapGenerateSchema = z.object({
  gapIndex: z.number().int().nonnegative().optional(),
  prompt: z.string().optional(),
  userId: z.string().uuid().optional(),
  workspaceId: z.string().uuid().optional(),
});

interface TimelineHistory {
  baseline: Timeline;
  commandLog: TimelineCommand[];
  undoIndex: number;
}

type PersistedData = Timeline & {
  commandLog?: TimelineCommand[];
  undoIndex?: number;
  history?: Timeline[];
  _history?: TimelineHistory;
};

function emptyTimelineData(partial: {
  id: string;
  projectId: string;
  name: string;
  fps: number;
  width: number;
  height: number;
}): Timeline {
  return {
    id: partial.id,
    projectId: partial.projectId,
    name: partial.name,
    fps: partial.fps,
    width: partial.width,
    height: partial.height,
    duration: 0,
    tracks: [
      {
        id: randomUUID(),
        type: 'video',
        name: 'V1',
        muted: false,
        locked: false,
        solo: false,
        height: 60,
        clips: [],
      },
      {
        id: randomUUID(),
        type: 'audio',
        name: 'A1',
        muted: false,
        locked: false,
        solo: false,
        height: 40,
        clips: [],
      },
    ],
    markers: [],
    version: 1,
  };
}

function stripHistory(timeline: Timeline): Timeline {
  const raw = timeline as PersistedData;
  const {
    commandLog: _c,
    undoIndex: _u,
    history: _h,
    _history: _hh,
    ...rest
  } = raw;
  return rest as Timeline;
}

function asTimeline(row: typeof timelines.$inferSelect): Timeline {
  const data = row.data as Partial<PersistedData>;
  if (data && Array.isArray(data.tracks)) {
    return stripHistory({
      id: row.id,
      projectId: row.projectId,
      name: row.name,
      fps: row.fps,
      width: row.width,
      height: row.height,
      duration: row.duration,
      tracks: data.tracks as Timeline['tracks'],
      markers: (data.markers as Timeline['markers']) ?? [],
      version: row.version,
    });
  }
  return emptyTimelineData({
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    fps: row.fps,
    width: row.width,
    height: row.height,
  });
}

function readHistory(row: typeof timelines.$inferSelect): TimelineHistory {
  const data = (row.data ?? {}) as PersistedData;
  if (data._history?.baseline && Array.isArray(data._history.commandLog)) {
    return {
      baseline: stripHistory(data._history.baseline),
      commandLog: data._history.commandLog,
      undoIndex: data._history.undoIndex ?? data._history.commandLog.length,
    };
  }
  // Fallback: commandLog at top level of data jsonb
  if (Array.isArray(data.commandLog)) {
    const fallbackBaseline = stripHistory({
      id: row.id,
      projectId: row.projectId,
      name: row.name,
      fps: row.fps,
      width: row.width,
      height: row.height,
      duration: 0,
      tracks: (data.tracks as Timeline['tracks']) ?? [],
      markers: (data.markers as Timeline['markers']) ?? [],
      version: 1,
    });
    // Prefer stored baseline via history snapshots if present
    const snap = Array.isArray(data.history) && data.history[0] ? stripHistory(data.history[0]) : null;
    return {
      baseline: snap ?? fallbackBaseline,
      commandLog: data.commandLog,
      undoIndex: data.undoIndex ?? data.commandLog.length,
    };
  }

  const current = asTimeline(row);
  return {
    baseline: structuredClone(current),
    commandLog: [],
    undoIndex: 0,
  };
}

function replay(baseline: Timeline, commands: TimelineCommand[]): Timeline {
  const engine = new TimelineEngine(baseline);
  for (const cmd of commands) {
    engine.apply(cmd);
  }
  return engine.getState();
}

function persistPayload(timeline: Timeline, history: TimelineHistory): Record<string, unknown> {
  return {
    ...timeline,
    commandLog: history.commandLog,
    undoIndex: history.undoIndex,
    history: [history.baseline, ...history.commandLog.slice(0, history.undoIndex).map((_, i) =>
      replay(history.baseline, history.commandLog.slice(0, i + 1)),
    )].slice(-20),
    _history: history,
  } as unknown as Record<string, unknown>;
}

@Injectable()
export class TimelineService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Optional() private readonly generation?: GenerationService,
    @Optional() private readonly renderQueue?: RenderQueueService,
  ) {}

  async listByProject(projectId: string) {
    return this.db.select().from(timelines).where(eq(timelines.projectId, projectId));
  }

  async create(projectId: string, body: unknown) {
    const parsed = CreateTimelineSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());

    const id = randomUUID();
    const fps = parsed.data.fps ?? 24;
    const width = parsed.data.width ?? 1920;
    const height = parsed.data.height ?? 1080;
    const data = emptyTimelineData({
      id,
      projectId,
      name: parsed.data.name,
      fps,
      width,
      height,
    });
    const history: TimelineHistory = {
      baseline: structuredClone(data),
      commandLog: [],
      undoIndex: 0,
    };

    const [row] = await this.db
      .insert(timelines)
      .values({
        id,
        projectId,
        name: parsed.data.name,
        fps,
        width,
        height,
        duration: 0,
        data: persistPayload(data, history),
      })
      .returning();

    return row;
  }

  async getById(id: string) {
    const [row] = await this.db.select().from(timelines).where(eq(timelines.id, id)).limit(1);
    if (!row) throw new NotFoundException('Timeline not found');
    const history = readHistory(row);
    return {
      ...row,
      timeline: asTimeline(row),
      canUndo: history.undoIndex > 0,
      canRedo: history.undoIndex < history.commandLog.length,
    };
  }

  async applyCommand(id: string, body: unknown) {
    const parsed = TimelineCommandSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());

    const [row] = await this.db.select().from(timelines).where(eq(timelines.id, id)).limit(1);
    if (!row) throw new NotFoundException('Timeline not found');

    const history = readHistory(row);
    const applied = history.commandLog.slice(0, history.undoIndex);
    const engine = new TimelineEngine(history.baseline);
    for (const cmd of applied) engine.apply(cmd);
    const next = engine.apply(parsed.data);

    const newHistory: TimelineHistory = {
      baseline: history.baseline,
      commandLog: [...applied, parsed.data],
      undoIndex: applied.length + 1,
    };

    const [updated] = await this.db
      .update(timelines)
      .set({
        data: persistPayload(next, newHistory),
        duration: next.duration,
        version: next.version,
        updatedAt: new Date(),
      })
      .where(eq(timelines.id, id))
      .returning();

    return {
      timeline: next,
      row: updated,
      canUndo: true,
      canRedo: false,
    };
  }

  async undo(id: string) {
    const [row] = await this.db.select().from(timelines).where(eq(timelines.id, id)).limit(1);
    if (!row) throw new NotFoundException('Timeline not found');

    const history = readHistory(row);
    if (history.undoIndex <= 0) {
      return { ...row, timeline: asTimeline(row), undone: false, canUndo: false, canRedo: history.commandLog.length > 0 };
    }

    const newHistory: TimelineHistory = {
      ...history,
      undoIndex: history.undoIndex - 1,
    };
    const next = replay(newHistory.baseline, newHistory.commandLog.slice(0, newHistory.undoIndex));

    const [updated] = await this.db
      .update(timelines)
      .set({
        data: persistPayload(next, newHistory),
        duration: next.duration,
        version: next.version,
        updatedAt: new Date(),
      })
      .where(eq(timelines.id, id))
      .returning();

    return {
      ...updated,
      timeline: next,
      undone: true,
      canUndo: newHistory.undoIndex > 0,
      canRedo: true,
    };
  }

  async redo(id: string) {
    const [row] = await this.db.select().from(timelines).where(eq(timelines.id, id)).limit(1);
    if (!row) throw new NotFoundException('Timeline not found');

    const history = readHistory(row);
    if (history.undoIndex >= history.commandLog.length) {
      return { ...row, timeline: asTimeline(row), redone: false, canUndo: history.undoIndex > 0, canRedo: false };
    }

    const newHistory: TimelineHistory = {
      ...history,
      undoIndex: history.undoIndex + 1,
    };
    const next = replay(newHistory.baseline, newHistory.commandLog.slice(0, newHistory.undoIndex));

    const [updated] = await this.db
      .update(timelines)
      .set({
        data: persistPayload(next, newHistory),
        duration: next.duration,
        version: next.version,
        updatedAt: new Date(),
      })
      .where(eq(timelines.id, id))
      .returning();

    return {
      ...updated,
      timeline: next,
      redone: true,
      canUndo: true,
      canRedo: newHistory.undoIndex < newHistory.commandLog.length,
    };
  }

  async render(id: string, body: unknown) {
    const parsed = RenderSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());

    const [row] = await this.db.select().from(timelines).where(eq(timelines.id, id)).limit(1);
    if (!row) throw new NotFoundException('Timeline not found');

    const timeline = asTimeline(row);
    const assetIds = new Set<string>();
    for (const track of timeline.tracks) {
      for (const clip of track.clips) {
        if (clip.assetId) assetIds.add(clip.assetId);
      }
    }

    const assetKeyMap: Record<string, string> = {};
    if (assetIds.size > 0) {
      const versions = await this.db
        .select()
        .from(assetVersions)
        .where(inArray(assetVersions.assetId, [...assetIds]))
        .orderBy(desc(assetVersions.version));
      const seen = new Set<string>();
      for (const v of versions) {
        if (seen.has(v.assetId)) continue;
        seen.add(v.assetId);
        assetKeyMap[v.assetId] = v.storageKey;
      }
    }

    const [deliverable] = await this.db
      .insert(deliverables)
      .values({
        projectId: row.projectId,
        name: parsed.data.name ?? `${row.name} render`,
        preset: parsed.data.preset,
        status: 'pending',
        metadata: { timelineId: id },
      })
      .returning();

    if (!deliverable) throw new BadRequestException('Failed to create deliverable');

    if (this.renderQueue) {
      await this.renderQueue.enqueue({
        deliverableId: deliverable.id,
        timelineId: id,
        projectId: row.projectId,
        timeline,
        assetKeyMap,
        preset: parsed.data.preset,
      });
    } else {
      console.log(
        `[timeline] render queued (no RenderQueueService) deliverable=${deliverable.id} timeline=${id}`,
      );
    }

    return deliverable;
  }

  async generateIntoGap(id: string, trackId: string, body: unknown, userId?: string) {
    const parsed = GapGenerateSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());

    const [row] = await this.db.select().from(timelines).where(eq(timelines.id, id)).limit(1);
    if (!row) throw new NotFoundException('Timeline not found');

    const timeline = asTimeline(row);
    const gaps = findGaps(timeline, trackId);
    if (gaps.length === 0) {
      throw new BadRequestException('No gaps on track');
    }
    const gap = gaps[parsed.data.gapIndex ?? 0];
    if (!gap) throw new BadRequestException('Gap index out of range');

    const neighbors = neighborsForGap(timeline, trackId, gap);
    const context = buildGenerateIntoGapContext(timeline, trackId, gap, neighbors);

    const [project] = await this.db
      .select()
      .from(projects)
      .where(eq(projects.id, row.projectId))
      .limit(1);

    const prompt =
      parsed.data.prompt ??
      `Fill timeline gap (${gap.duration.toFixed(2)}s) matching neighbouring shots. Context: ${JSON.stringify(context).slice(0, 800)}`;

    let job = null;
    const actorId = userId ?? parsed.data.userId;
    const workspaceId = parsed.data.workspaceId ?? project?.workspaceId;

    if (this.generation && actorId && workspaceId) {
      job = await this.generation.generate(actorId, {
        capability: 'video.generate',
        workspaceId,
        projectId: row.projectId,
        intent: {
          prompt,
          parameters: {
            durationSec: gap.duration,
            gapStart: gap.start,
            gapEnd: gap.end,
            trackId,
            neighborBeforeAssetId: neighbors.previous?.assetId,
            neighborAfterAssetId: neighbors.next?.assetId,
          },
          shotDna: {
            durationSec: gap.duration,
          },
        },
        constraints: {
          qualityMode: 'balanced',
        },
        parentAssetIds: [
          neighbors.previous?.assetId,
          neighbors.next?.assetId,
        ].filter((id): id is string => Boolean(id)),
      });
    }

    return {
      context,
      job,
      planned: {
        capability: 'video.generate',
        durationSec: gap.duration,
        prompt,
      },
    };
  }
}

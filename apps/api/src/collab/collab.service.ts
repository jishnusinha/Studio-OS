import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  collabRooms,
  comments,
  crdtDocuments,
  presenceSessions,
  users,
  type Database,
} from '@studio-os/db';
import { and, asc, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { DB } from '../db/db.tokens.js';

const CreateRoomSchema = z.object({
  name: z.string().min(1).max(200),
  kind: z.string().optional(),
  targetType: z.string().optional(),
  targetId: z.string().uuid().optional(),
});

const JoinPresenceSchema = z.object({
  roomId: z.string().uuid().optional(),
  displayName: z.string().optional(),
  color: z.string().optional(),
});

const CursorSchema = z.object({
  cursorX: z.number().optional(),
  cursorY: z.number().optional(),
  selection: z.record(z.unknown()).optional(),
});

const UpsertCrdtSchema = z.object({
  docKey: z.string().min(1).max(200),
  roomId: z.string().uuid().optional(),
  /** base64-encoded Yjs update / state */
  stateBase64: z.string().optional(),
  stateText: z.string().optional(),
});

const CreateCommentSchema = z.object({
  targetType: z.string().min(1),
  targetId: z.string().uuid(),
  body: z.string().min(1),
  parentId: z.string().uuid().optional(),
  timecode: z.number().optional(),
});

const PRESENCE_COLORS = ['#7dd3fc', '#6ee7b7', '#fbbf24', '#f472b6', '#a78bfa', '#fb923c'];

@Injectable()
export class CollabService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async listRooms(projectId: string) {
    return this.db
      .select()
      .from(collabRooms)
      .where(eq(collabRooms.projectId, projectId))
      .orderBy(desc(collabRooms.createdAt));
  }

  async createRoom(projectId: string, body: unknown) {
    const parsed = CreateRoomSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const [row] = await this.db
      .insert(collabRooms)
      .values({
        projectId,
        name: parsed.data.name,
        kind: parsed.data.kind ?? 'timeline',
        targetType: parsed.data.targetType,
        targetId: parsed.data.targetId,
      })
      .returning();
    return row;
  }

  async joinPresence(projectId: string, userId: string, body: unknown) {
    const parsed = JoinPresenceSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());

    const [user] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
    const color =
      parsed.data.color ??
      PRESENCE_COLORS[Math.floor(Math.random() * PRESENCE_COLORS.length)];

    // Replace prior session for same user+project
    await this.db
      .delete(presenceSessions)
      .where(and(eq(presenceSessions.projectId, projectId), eq(presenceSessions.userId, userId)));

    const [row] = await this.db
      .insert(presenceSessions)
      .values({
        projectId,
        roomId: parsed.data.roomId,
        userId,
        displayName: parsed.data.displayName ?? user?.name ?? 'Collaborator',
        color,
        lastSeenAt: new Date(),
      })
      .returning();
    return row;
  }

  async leavePresence(sessionId: string) {
    await this.db.delete(presenceSessions).where(eq(presenceSessions.id, sessionId));
    return { ok: true };
  }

  async updateCursor(sessionId: string, body: unknown) {
    const parsed = CursorSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const [row] = await this.db
      .update(presenceSessions)
      .set({
        cursorX: parsed.data.cursorX,
        cursorY: parsed.data.cursorY,
        selection: (parsed.data.selection ?? {}) as Record<string, unknown>,
        lastSeenAt: new Date(),
      })
      .where(eq(presenceSessions.id, sessionId))
      .returning();
    if (!row) throw new NotFoundException('Presence session not found');
    return row;
  }

  async listPresence(projectId: string) {
    return this.db
      .select()
      .from(presenceSessions)
      .where(eq(presenceSessions.projectId, projectId))
      .orderBy(desc(presenceSessions.lastSeenAt));
  }

  async getCrdtDocument(projectId: string, docKey: string) {
    const [row] = await this.db
      .select()
      .from(crdtDocuments)
      .where(and(eq(crdtDocuments.projectId, projectId), eq(crdtDocuments.docKey, docKey)))
      .limit(1);
    if (!row) return null;
    return {
      ...row,
      stateBase64: row.state ? Buffer.from(row.state).toString('base64') : null,
    };
  }

  async upsertCrdtDocument(projectId: string, body: unknown, userId?: string) {
    const parsed = UpsertCrdtSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());

    const stateBuf = parsed.data.stateBase64
      ? Buffer.from(parsed.data.stateBase64, 'base64')
      : null;

    const existing = await this.getCrdtDocument(projectId, parsed.data.docKey);
    if (existing) {
      const [updated] = await this.db
        .update(crdtDocuments)
        .set({
          roomId: parsed.data.roomId ?? existing.roomId,
          state: stateBuf ?? existing.state,
          stateText: parsed.data.stateText ?? existing.stateText,
          version: (existing.version ?? 0) + 1,
          updatedBy: userId,
          updatedAt: new Date(),
        })
        .where(eq(crdtDocuments.id, existing.id))
        .returning();
      return {
        ...updated,
        stateBase64: updated?.state ? Buffer.from(updated.state).toString('base64') : null,
      };
    }

    const [created] = await this.db
      .insert(crdtDocuments)
      .values({
        projectId,
        roomId: parsed.data.roomId,
        docKey: parsed.data.docKey,
        state: stateBuf ?? undefined,
        stateText: parsed.data.stateText,
        version: 1,
        updatedBy: userId,
      })
      .returning();
    return {
      ...created,
      stateBase64: created?.state ? Buffer.from(created.state).toString('base64') : null,
    };
  }

  async listComments(projectId: string, targetType?: string, targetId?: string) {
    let rows = await this.db
      .select()
      .from(comments)
      .where(eq(comments.projectId, projectId))
      .orderBy(asc(comments.createdAt));
    if (targetType) rows = rows.filter((r) => r.targetType === targetType);
    if (targetId) rows = rows.filter((r) => r.targetId === targetId);
    return rows;
  }

  async createComment(projectId: string, userId: string, body: unknown) {
    const parsed = CreateCommentSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    if (parsed.data.parentId) {
      const [parent] = await this.db
        .select()
        .from(comments)
        .where(eq(comments.id, parsed.data.parentId))
        .limit(1);
      if (!parent || parent.projectId !== projectId) {
        throw new BadRequestException('Invalid parent comment');
      }
    }
    const [row] = await this.db
      .insert(comments)
      .values({
        projectId,
        userId,
        parentId: parsed.data.parentId,
        targetType: parsed.data.targetType,
        targetId: parsed.data.targetId,
        body: parsed.data.body,
        timecode: parsed.data.timecode,
      })
      .returning();
    return row;
  }

  /** Threaded tree: roots + children */
  async threadedComments(projectId: string, targetType?: string, targetId?: string) {
    const all = await this.listComments(projectId, targetType, targetId);
    const byParent = new Map<string | null, typeof all>();
    for (const c of all) {
      const key = c.parentId ?? null;
      const list = byParent.get(key) ?? [];
      list.push(c);
      byParent.set(key, list);
    }
    function nest(parentId: string | null): Array<(typeof all)[number] & { replies: unknown[] }> {
      return (byParent.get(parentId) ?? []).map((c) => ({
        ...c,
        replies: nest(c.id),
      }));
    }
    return nest(null);
  }
}

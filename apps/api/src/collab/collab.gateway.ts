import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Inject, Logger } from '@nestjs/common';
import type { Server, WebSocket } from 'ws';
import { CollabService } from './collab.service.js';

type ClientState = {
  projectId?: string;
  userId?: string;
  sessionId?: string;
  displayName?: string;
};

type CollabSocket = WebSocket & { collab?: ClientState };

@WebSocketGateway({ path: '/collab', cors: { origin: 'http://localhost:3000' } })
export class CollabGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(CollabGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(@Inject(CollabService) private readonly collab: CollabService) {}

  handleConnection(client: CollabSocket) {
    client.collab = {};
    this.logger.debug('collab client connected');
  }

  async handleDisconnect(client: CollabSocket) {
    const sessionId = client.collab?.sessionId;
    const projectId = client.collab?.projectId;
    if (sessionId) {
      await this.collab.leavePresence(sessionId).catch(() => undefined);
      if (projectId) {
        this.broadcast(projectId, { type: 'presence.leave', sessionId }, client);
      }
    }
  }

  @SubscribeMessage('presence.join')
  async onJoin(
    @ConnectedSocket() client: CollabSocket,
    @MessageBody()
    body: { projectId: string; userId: string; roomId?: string; displayName?: string; color?: string },
  ) {
    if (!body?.projectId || !body?.userId) {
      return { event: 'error', data: { message: 'projectId and userId required' } };
    }
    const session = await this.collab.joinPresence(body.projectId, body.userId, body);
    client.collab = {
      projectId: body.projectId,
      userId: body.userId,
      sessionId: session!.id,
      displayName: session!.displayName ?? undefined,
    };
    this.broadcast(body.projectId, { type: 'presence.join', session }, client);
    const peers = await this.collab.listPresence(body.projectId);
    return { event: 'presence.snapshot', data: { session, peers } };
  }

  @SubscribeMessage('presence.leave')
  async onLeave(@ConnectedSocket() client: CollabSocket) {
    const { sessionId, projectId } = client.collab ?? {};
    if (sessionId) {
      await this.collab.leavePresence(sessionId);
      if (projectId) {
        this.broadcast(projectId, { type: 'presence.leave', sessionId }, client);
      }
    }
    client.collab = {};
    return { event: 'presence.left', data: { ok: true } };
  }

  @SubscribeMessage('presence.cursor')
  async onCursor(
    @ConnectedSocket() client: CollabSocket,
    @MessageBody() body: { cursorX?: number; cursorY?: number; selection?: Record<string, unknown> },
  ) {
    const { sessionId, projectId } = client.collab ?? {};
    if (!sessionId || !projectId) {
      return { event: 'error', data: { message: 'Not joined' } };
    }
    const session = await this.collab.updateCursor(sessionId, body);
    this.broadcast(projectId, { type: 'presence.cursor', session }, client);
    return { event: 'presence.cursor.ack', data: session };
  }

  @SubscribeMessage('yjs.sync')
  async onYjsSync(
    @ConnectedSocket() client: CollabSocket,
    @MessageBody()
    body: { projectId?: string; docKey: string; stateBase64?: string; stateText?: string; roomId?: string },
  ) {
    const projectId = body.projectId ?? client.collab?.projectId;
    if (!projectId || !body.docKey) {
      return { event: 'error', data: { message: 'projectId and docKey required' } };
    }
    if (body.stateBase64 || body.stateText) {
      const doc = await this.collab.upsertCrdtDocument(projectId, body, client.collab?.userId);
      this.broadcast(
        projectId,
        { type: 'yjs.update', docKey: body.docKey, stateBase64: doc?.stateBase64, version: doc?.version },
        client,
      );
      return { event: 'yjs.ack', data: doc };
    }
    const existing = await this.collab.getCrdtDocument(projectId, body.docKey);
    return { event: 'yjs.state', data: existing };
  }

  @SubscribeMessage('timeline.command')
  onTimelineCommand(
    @ConnectedSocket() client: CollabSocket,
    @MessageBody() body: { timelineId: string; command: Record<string, unknown> },
  ) {
    const projectId = client.collab?.projectId;
    if (!projectId) {
      return { event: 'error', data: { message: 'Not joined' } };
    }
    // Broadcast so peers can apply; clients still persist via timelinesApi.command for undo.
    this.broadcast(
      projectId,
      {
        type: 'timeline.command',
        timelineId: body.timelineId,
        command: body.command,
        from: client.collab?.userId,
      },
      client,
    );
    return { event: 'timeline.command.ack', data: { ok: true } };
  }

  private broadcast(projectId: string, payload: unknown, except?: CollabSocket) {
    const msg = JSON.stringify(payload);
    for (const client of this.server.clients) {
      const c = client as CollabSocket;
      if (c === except) continue;
      if (c.readyState === 1 && c.collab?.projectId === projectId) {
        c.send(msg);
      }
    }
  }
}

'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Input, Textarea, Spinner } from '@studio-os/ui';
import {
  authApi,
  collabApi,
  timelinesApi,
  type CollabCommentDto,
  type PresenceSessionDto,
} from '@/lib/api';
import clsx from 'clsx';

export default function CollabPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const qc = useQueryClient();
  const [body, setBody] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [cursors, setCursors] = useState<PresenceSessionDto[]>([]);
  const [docText, setDocText] = useState('');
  const [wsStatus, setWsStatus] = useState<'off' | 'connecting' | 'live'>('off');

  const meQuery = useQuery({ queryKey: ['me'], queryFn: () => authApi.me() });
  const presenceQuery = useQuery({
    queryKey: ['collab', 'presence', projectId],
    queryFn: () => collabApi.listPresence(projectId),
    enabled: Boolean(projectId),
    refetchInterval: 8000,
  });
  const commentsQuery = useQuery({
    queryKey: ['collab', 'comments', projectId],
    queryFn: () =>
      collabApi.listComments(projectId, {
        targetType: 'project',
        targetId: projectId,
        threaded: true,
      }),
    enabled: Boolean(projectId),
  });
  const timelinesQuery = useQuery({
    queryKey: ['timelines', projectId],
    queryFn: () => timelinesApi.list(projectId),
    enabled: Boolean(projectId),
  });
  const docQuery = useQuery({
    queryKey: ['collab', 'doc', projectId, 'script'],
    queryFn: () => collabApi.getDoc(projectId, 'script'),
    enabled: Boolean(projectId),
  });

  useEffect(() => {
    if (docQuery.data?.stateText) setDocText(docQuery.data.stateText);
  }, [docQuery.data?.stateText]);

  useEffect(() => {
    if (!projectId || !meQuery.data?.user?.id) return;
    let ws: WebSocket | null = null;
    let sessionId: string | null = null;
    let cancelled = false;

    void (async () => {
      setWsStatus('connecting');
      const session = await collabApi.joinPresence(projectId, {
        displayName: meQuery.data!.user.name,
      });
      if (cancelled) return;
      sessionId = session.id;
      void qc.invalidateQueries({ queryKey: ['collab', 'presence', projectId] });

      try {
        ws = new WebSocket(collabApi.wsUrl());
        ws.onopen = () => {
          setWsStatus('live');
          ws?.send(
            JSON.stringify({
              event: 'presence.join',
              data: {
                projectId,
                userId: meQuery.data!.user.id,
                displayName: meQuery.data!.user.name,
              },
            }),
          );
        };
        ws.onmessage = (ev) => {
          try {
            const msg = JSON.parse(String(ev.data)) as {
              type?: string;
              session?: PresenceSessionDto;
              event?: string;
              data?: unknown;
            };
            if (msg.type === 'presence.cursor' && msg.session) {
              setCursors((prev) => {
                const rest = prev.filter((p) => p.id !== msg.session!.id);
                return [...rest, msg.session!];
              });
            }
            if (msg.type === 'yjs.update') {
              void qc.invalidateQueries({ queryKey: ['collab', 'doc', projectId] });
            }
          } catch {
            /* ignore */
          }
        };
        ws.onclose = () => setWsStatus('off');
      } catch {
        setWsStatus('off');
      }
    })();

    return () => {
      cancelled = true;
      ws?.close();
      if (sessionId) void collabApi.leavePresence(sessionId);
    };
  }, [projectId, meQuery.data?.user?.id, meQuery.data?.user?.name, qc]);

  const createComment = useMutation({
    mutationFn: () =>
      collabApi.createComment(projectId, {
        targetType: 'project',
        targetId: projectId,
        body: body.trim(),
        parentId: replyTo ?? undefined,
      }),
    onSuccess: () => {
      setBody('');
      setReplyTo(null);
      void qc.invalidateQueries({ queryKey: ['collab', 'comments', projectId] });
    },
  });

  const saveDoc = useMutation({
    mutationFn: () =>
      collabApi.upsertDoc(projectId, { docKey: 'script', stateText: docText }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['collab', 'doc', projectId] });
    },
  });

  const emitTimelineCommand = useMutation({
    mutationFn: async () => {
      const list = (timelinesQuery.data ?? []) as Array<{ id: string }>;
      const tl = list[0];
      if (!tl) throw new Error('No timeline');
      return timelinesApi.command(tl.id, {
        id: crypto.randomUUID(),
        type: 'add_marker',
        payload: { time: Math.random() * 10, label: 'collab', color: '#7dd3fc' },
        timestamp: Date.now(),
        source: 'user',
      });
    },
  });

  const peers = presenceQuery.data ?? [];
  const threaded = (commentsQuery.data ?? []) as CollabCommentDto[];

  const cursorOverlay = useMemo(
    () => cursors.filter((c) => c.cursorX != null && c.cursorY != null),
    [cursors],
  );

  return (
    <div className="h-full flex flex-col min-h-0 relative">
      <div className="border-b border-cinema-border px-4 py-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[11px] uppercase tracking-[0.14em] text-cinema-muted font-semibold">
            Collaboration
          </div>
          <h1 className="text-[16px] font-semibold">Presence · CRDT · Comments</h1>
        </div>
        <Badge tone={wsStatus === 'live' ? 'accent' : 'warning'}>ws {wsStatus}</Badge>
      </div>

      <div className="flex-1 min-h-0 grid lg:grid-cols-[1fr_300px]">
        <div className="min-h-0 overflow-y-auto p-4 space-y-4 relative">
          {/* Live cursors stub */}
          <div
            className="relative h-[160px] rounded-md border border-cinema-border bg-cinema-panel overflow-hidden"
            onMouseMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const session = peers.find((p) => p.userId === meQuery.data?.user?.id);
              if (!session) return;
              const x = e.clientX - rect.left;
              const y = e.clientY - rect.top;
              void collabApi.updateCursor(session.id, { cursorX: x, cursorY: y });
            }}
          >
            <div className="absolute inset-0 flex items-center justify-center text-[12px] text-cinema-muted">
              Move mouse for live cursor stub
            </div>
            {cursorOverlay.map((c) => (
              <div
                key={c.id}
                className="absolute pointer-events-none text-[10px] font-medium"
                style={{
                  left: c.cursorX ?? 0,
                  top: c.cursorY ?? 0,
                  color: c.color ?? '#7dd3fc',
                  transform: 'translate(-2px, -2px)',
                }}
              >
                <span
                  className="inline-block w-2 h-2 rounded-full mr-1"
                  style={{ background: c.color ?? '#7dd3fc' }}
                />
                {c.displayName ?? 'Peer'}
              </div>
            ))}
          </div>

          <div>
            <div className="text-[11px] uppercase tracking-wide text-cinema-muted font-semibold mb-2">
              Script CRDT stub
            </div>
            <Textarea
              value={docText}
              onChange={(e) => setDocText(e.target.value)}
              rows={8}
              placeholder="Collaborative script / notes state (stored as text Yjs stub)"
            />
            <div className="mt-2 flex gap-2">
              <Button
                size="sm"
                type="button"
                disabled={saveDoc.isPending}
                onClick={() => saveDoc.mutate()}
              >
                Save doc state
              </Button>
              <Button
                size="sm"
                variant="secondary"
                type="button"
                disabled={emitTimelineCommand.isPending}
                onClick={() => emitTimelineCommand.mutate()}
              >
                Emit TimelineCommand
              </Button>
            </div>
            <p className="text-[11px] text-cinema-muted mt-1.5">
              Timeline/script edits persist TimelineCommands for undo; WS broadcasts peer awareness.
            </p>
          </div>
        </div>

        <aside className="border-l border-cinema-border p-3 overflow-y-auto min-h-0">
          <div className="text-[11px] uppercase tracking-wide text-cinema-muted font-semibold mb-2">
            Presence
          </div>
          <div className="flex flex-wrap gap-1.5 mb-4">
            {peers.map((p) => (
              <span
                key={p.id}
                className="inline-flex items-center gap-1 rounded-full border border-cinema-border px-2 py-0.5 text-[11px]"
                title={p.displayName ?? p.userId}
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ background: p.color ?? '#7dd3fc' }}
                />
                {(p.displayName ?? 'User').slice(0, 12)}
              </span>
            ))}
            {peers.length === 0 && (
              <span className="text-[12px] text-cinema-muted">No one online</span>
            )}
          </div>

          <div className="text-[11px] uppercase tracking-wide text-cinema-muted font-semibold mb-2">
            Threaded comments
          </div>
          {commentsQuery.isLoading ? (
            <Spinner size={14} />
          ) : (
            <div className="space-y-2 mb-3">
              {threaded.map((c) => (
                <CommentThread
                  key={c.id}
                  comment={c}
                  onReply={(id) => setReplyTo(id)}
                  depth={0}
                />
              ))}
              {threaded.length === 0 && (
                <p className="text-[12px] text-cinema-muted">No comments yet.</p>
              )}
            </div>
          )}

          {replyTo && (
            <div className="text-[10px] text-cinema-muted mb-1">
              Replying to {replyTo.slice(0, 8)}…{' '}
              <button type="button" className="underline" onClick={() => setReplyTo(null)}>
                cancel
              </button>
            </div>
          )}
          <Input
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Add a comment"
          />
          <Button
            className="mt-2 w-full"
            size="sm"
            type="button"
            disabled={!body.trim() || createComment.isPending}
            onClick={() => createComment.mutate()}
          >
            Post
          </Button>
        </aside>
      </div>
    </div>
  );
}

function CommentThread({
  comment,
  onReply,
  depth,
}: {
  comment: CollabCommentDto;
  onReply: (id: string) => void;
  depth: number;
}) {
  return (
    <div className={clsx(depth > 0 && 'ml-3 border-l border-cinema-border pl-2')}>
      <div className="rounded border border-cinema-border/70 px-2 py-1.5">
        <p className="text-[12px] leading-relaxed">{comment.body}</p>
        <button
          type="button"
          className="text-[10px] text-cinema-accent mt-1"
          onClick={() => onReply(comment.id)}
        >
          Reply
        </button>
      </div>
      {(comment.replies ?? []).map((r) => (
        <div key={r.id} className="mt-1.5">
          <CommentThread comment={r} onReply={onReply} depth={depth + 1} />
        </div>
      ))}
    </div>
  );
}

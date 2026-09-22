'use client';

import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { authApi, collabApi } from '@/lib/api';

/** Presence avatars for StudioShell header */
export function PresenceAvatars() {
  const params = useParams<{ id?: string }>();
  const projectId = params.id;
  const qc = useQueryClient();
  const meQuery = useQuery({ queryKey: ['me'], queryFn: () => authApi.me() });
  const presenceQuery = useQuery({
    queryKey: ['collab', 'presence', projectId],
    queryFn: () => collabApi.listPresence(projectId!),
    enabled: Boolean(projectId),
    refetchInterval: 10000,
  });

  useEffect(() => {
    if (!projectId || !meQuery.data?.user) return;
    let sessionId: string | null = null;
    let cancelled = false;
    void collabApi
      .joinPresence(projectId, { displayName: meQuery.data.user.name })
      .then((s) => {
        if (cancelled) {
          void collabApi.leavePresence(s.id);
          return;
        }
        sessionId = s.id;
        void qc.invalidateQueries({ queryKey: ['collab', 'presence', projectId] });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      if (sessionId) void collabApi.leavePresence(sessionId);
    };
  }, [projectId, meQuery.data?.user?.id, meQuery.data?.user?.name, qc]);

  if (!projectId) return null;
  const peers = presenceQuery.data ?? [];
  if (peers.length === 0) return null;

  return (
    <div className="flex items-center -space-x-1.5 pr-1" title="Live collaborators">
      {peers.slice(0, 5).map((p) => (
        <span
          key={p.id}
          className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-cinema-border text-[9px] font-semibold text-cinema-bg"
          style={{ background: p.color ?? '#7dd3fc' }}
          title={p.displayName ?? 'Collaborator'}
        >
          {(p.displayName ?? '?').slice(0, 1).toUpperCase()}
        </span>
      ))}
      {peers.length > 5 && (
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-cinema-border bg-cinema-raised text-[9px] text-cinema-muted">
          +{peers.length - 5}
        </span>
      )}
    </div>
  );
}

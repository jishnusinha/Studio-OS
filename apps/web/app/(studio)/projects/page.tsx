'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Badge, Button, Spinner, StatusChip } from '@studio-os/ui';
import { authApi, projectsApi, asNumber, type ProjectDto } from '@/lib/api';
import { useStudioStore } from '@/lib/store';
import { Clapperboard, LogOut } from 'lucide-react';

export default function ProjectsPage() {
  const router = useRouter();
  const setProject = useStudioStore((s) => s.setProject);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  const meQuery = useQuery({
    queryKey: ['me'],
    queryFn: () => authApi.me(),
    retry: false,
  });

  useEffect(() => {
    if (meQuery.isError) {
      setAuthError((meQuery.error as Error).message);
    }
    if (meQuery.data?.workspaces?.[0]?.id) {
      setWorkspaceId(meQuery.data.workspaces[0].id);
    }
  }, [meQuery.data, meQuery.error, meQuery.isError]);

  const projectsQuery = useQuery({
    queryKey: ['projects', workspaceId],
    queryFn: () => projectsApi.listByWorkspace(workspaceId!),
    enabled: Boolean(workspaceId),
    retry: false,
  });

  async function logout() {
    try {
      await authApi.logout();
    } catch {
      /* ignore */
    }
    router.replace('/login');
  }

  function openProject(p: ProjectDto) {
    setProject(p.id, p.name);
    router.push(`/projects/${p.id}`);
  }

  const projects = projectsQuery.data ?? [];

  return (
    <div className="h-full overflow-y-auto">
      <div className="border-b border-cinema-border px-5 py-4 flex items-center justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.14em] text-cinema-muted font-semibold">Workspace</div>
          <h1 className="text-[20px] font-semibold">Projects</h1>
        </div>
        <div className="flex items-center gap-2">
          {meQuery.data?.user && (
            <span className="text-[12px] text-cinema-muted hidden sm:inline">{meQuery.data.user.email}</span>
          )}
          <Button size="sm" variant="ghost" leftIcon={<LogOut size={13} />} onClick={logout}>
            Log out
          </Button>
        </div>
      </div>

      <div className="p-5">
        {(meQuery.isLoading || (workspaceId && projectsQuery.isLoading)) && (
          <div className="py-16 flex justify-center">
            <Spinner label="Loading projects…" />
          </div>
        )}

        {(authError || meQuery.isError) && !workspaceId && (
          <div className="rounded-lg border border-cinema-border bg-cinema-panel p-6 max-w-lg">
            <div className="text-[14px] font-semibold mb-1">Session required</div>
            <p className="text-[12px] text-cinema-muted mb-4">
              {authError ?? 'Sign in to load workspaces from the API.'}
            </p>
            <Link href="/login">
              <Button variant="primary" size="sm">
                Go to login
              </Button>
            </Link>
          </div>
        )}

        {meQuery.data && !workspaceId && !meQuery.isLoading && (
          <div className="rounded-lg border border-dashed border-cinema-border p-6 text-[13px] text-cinema-muted">
            No workspaces returned from <span className="font-mono">/auth/me</span>. Ensure the API attaches
            workspaces to the session user.
          </div>
        )}

        {projectsQuery.isError && (
          <div className="mb-4 rounded-md border border-cinema-danger/30 bg-cinema-danger/10 px-3 py-2 text-[12px] text-cinema-danger">
            {(projectsQuery.error as Error).message}
          </div>
        )}

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {projects.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => openProject(p)}
              className="text-left rounded-lg border border-cinema-border bg-cinema-panel hover:border-cinema-accent/40 transition-colors overflow-hidden"
            >
              <div className="aspect-[16/9] studio-grid-bg bg-gradient-to-br from-cinema-raised to-cinema-bg relative">
                <div className="absolute inset-0 flex items-center justify-center text-cinema-accent/80">
                  <Clapperboard size={28} />
                </div>
                <div className="absolute top-2 left-2">
                  <Badge tone="accent">{p.type}</Badge>
                </div>
              </div>
              <div className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-[14px] font-semibold">{p.name}</div>
                    <div className="text-[11px] text-cinema-muted font-mono mt-0.5">{p.slug}</div>
                  </div>
                  <StatusChip status="ready" label="open" />
                </div>
                {p.description && (
                  <p className="text-[12px] text-cinema-muted mt-2 line-clamp-2">{p.description}</p>
                )}
                <div className="mt-3 flex items-center justify-between text-[11px] text-cinema-muted font-mono">
                  <span>⚡ ${asNumber(p.spentUsd).toFixed(2)}</span>
                  <span>budget ${asNumber(p.budgetUsd).toFixed(0)}</span>
                </div>
              </div>
            </button>
          ))}
        </div>

        {workspaceId && !projectsQuery.isLoading && projects.length === 0 && !projectsQuery.isError && (
          <div className="rounded-lg border border-dashed border-cinema-border p-10 text-center text-cinema-muted text-[13px]">
            No projects yet. Seed the demo project via <span className="font-mono">pnpm db:seed</span>.
          </div>
        )}
      </div>
    </div>
  );
}

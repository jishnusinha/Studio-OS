'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  Clapperboard,
  Image as ImageIcon,
  Video,
  Scissors,
  ListTodo,
  GitBranch,
  Columns2,
  Focus,
  Search,
  User,
  FolderKanban,
  Film,
  ScanSearch,
  Megaphone,
  AudioLines,
  Music2,
  Palette,
  Grid2x2,
} from 'lucide-react';
import { useStudioStore } from '@/lib/store';
import { projectsApi } from '@/lib/api';

interface CommandItem {
  id: string;
  label: string;
  hint?: string;
  icon: typeof Search;
  run: () => void;
}

export function CommandPalette() {
  const open = useStudioStore((s) => s.commandOpen);
  const setCommandOpen = useStudioStore((s) => s.setCommandOpen);
  const toggleFocusMode = useStudioStore((s) => s.toggleFocusMode);
  const selectShot = useStudioStore((s) => s.selectShot);
  const setSelection = useStudioStore((s) => s.setSelection);
  const params = useParams<{ id?: string }>();
  const router = useRouter();
  const [q, setQ] = useState('');
  const projectId = params.id;

  useEffect(() => {
    if (!open) setQ('');
  }, [open]);

  const searchQuery = useQuery({
    queryKey: ['project-search', projectId, q],
    queryFn: () => projectsApi.search(projectId!, q),
    enabled: Boolean(open && projectId && q.trim().length >= 1),
    staleTime: 5_000,
  });

  const navItems = useMemo<CommandItem[]>(() => {
    const base = projectId ? `/projects/${projectId}` : '/projects';
    const list: CommandItem[] = [
      {
        id: 'projects',
        label: 'Go to Projects',
        hint: 'All projects',
        icon: Clapperboard,
        run: () => router.push('/projects'),
      },
      {
        id: 'focus',
        label: 'Toggle Focus Mode',
        hint: 'Tab',
        icon: Focus,
        run: () => toggleFocusMode(),
      },
    ];
    if (projectId) {
      list.push(
        {
          id: 'shots',
          label: 'Cinema Board',
          hint: 'Shots',
          icon: Clapperboard,
          run: () => router.push(base),
        },
        {
          id: 'continuity',
          label: 'Continuity Engine',
          hint: 'C',
          icon: ScanSearch,
          run: () => router.push(`${base}/continuity`),
        },
        {
          id: 'commercial',
          label: 'Commercial Studio',
          icon: Megaphone,
          run: () => router.push(`${base}/commercial`),
        },
        {
          id: 'assets',
          label: 'Asset Browser',
          icon: FolderKanban,
          run: () => router.push(`${base}/assets`),
        },
        {
          id: 'image',
          label: 'Open Image Lab',
          icon: ImageIcon,
          run: () => router.push(`${base}/image`),
        },
        {
          id: 'video',
          label: 'Open Video Lab',
          icon: Video,
          run: () => router.push(`${base}/video`),
        },
        {
          id: 'audio',
          label: 'Open Audio Lab',
          icon: AudioLines,
          run: () => router.push(`${base}/audio`),
        },
        {
          id: 'music',
          label: 'Open Music',
          icon: Music2,
          run: () => router.push(`${base}/music`),
        },
        {
          id: 'color',
          label: 'Open Color',
          icon: Palette,
          run: () => router.push(`${base}/color`),
        },
        {
          id: 'multicam',
          label: 'Open Multicam',
          icon: Grid2x2,
          run: () => router.push(`${base}/multicam`),
        },
        {
          id: 'edit',
          label: 'Open Edit',
          icon: Scissors,
          run: () => router.push(`${base}/edit`),
        },
        {
          id: 'audio',
          label: 'Open Audio Lab',
          icon: AudioLines,
          run: () => router.push(`${base}/audio`),
        },
        {
          id: 'music',
          label: 'Open Music Studio',
          icon: Music2,
          run: () => router.push(`${base}/music`),
        },
        {
          id: 'compare',
          label: 'Compare Takes',
          icon: Columns2,
          run: () => router.push(`${base}/compare`),
        },
        {
          id: 'jobs',
          label: 'Generation Center',
          icon: ListTodo,
          run: () => router.push(`${base}/jobs`),
        },
        {
          id: 'lineage',
          label: 'Lineage Graph',
          icon: GitBranch,
          run: () => router.push(`${base}/lineage`),
        },
      );
    }
    const query = q.trim().toLowerCase();
    if (!query) return list;
    return list.filter(
      (i) => i.label.toLowerCase().includes(query) || i.hint?.toLowerCase().includes(query),
    );
  }, [projectId, q, router, toggleFocusMode]);

  const entityItems = useMemo<CommandItem[]>(() => {
    const data = searchQuery.data;
    if (!data || !projectId) return [];
    const items: CommandItem[] = [];
    for (const s of data.scenes ?? []) {
      items.push({
        id: `scene-${s.id}`,
        label: s.label ?? s.heading ?? 'Scene',
        hint: `Scene ${s.number ?? ''}`,
        icon: Film,
        run: () => {
          setSelection({
            kind: 'scene',
            id: s.id,
            label: s.heading ?? s.label ?? 'Scene',
            meta: { ...s } as Record<string, unknown>,
          });
          router.push(`/projects/${projectId}/story`);
        },
      });
    }
    for (const s of data.shots ?? []) {
      items.push({
        id: `shot-${s.id}`,
        label: s.label ?? s.code ?? 'Shot',
        hint: s.description ?? 'Shot',
        icon: Clapperboard,
        run: () => {
          selectShot(s.id, s.code ?? s.label ?? 'Shot', { ...s } as Record<string, unknown>);
          router.push(`/projects/${projectId}`);
        },
      });
    }
    for (const c of data.characters ?? []) {
      items.push({
        id: `char-${c.id}`,
        label: c.label ?? c.name ?? 'Character',
        hint: 'Character',
        icon: User,
        run: () => {
          setSelection({
            kind: 'character',
            id: c.id,
            label: c.name ?? c.label ?? 'Character',
            meta: { ...c } as Record<string, unknown>,
          });
          router.push(`/projects/${projectId}/story`);
        },
      });
    }
    for (const a of data.assets ?? []) {
      items.push({
        id: `asset-${a.id}`,
        label: a.label ?? a.name ?? 'Asset',
        hint: a.type ?? 'Asset',
        icon: FolderKanban,
        run: () => {
          setSelection({
            kind: 'asset',
            id: a.id,
            label: a.name ?? a.label ?? 'Asset',
            meta: { ...a } as Record<string, unknown>,
          });
          router.push(`/projects/${projectId}/assets`);
        },
      });
    }
    return items;
  }, [searchQuery.data, projectId, router, selectShot, setSelection]);

  const items = [...entityItems, ...navItems];

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-[2px] flex items-start justify-center pt-[14vh] px-4"
      onMouseDown={() => setCommandOpen(false)}
    >
      <div
        className="w-full max-w-xl rounded-xl border border-cinema-border-strong bg-cinema-panel shadow-cinema overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-cinema-border px-3">
          <Search size={15} className="text-cinema-muted" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search shots, scenes, characters, assets…"
            className="flex-1 h-12 bg-transparent text-[14px] outline-none placeholder:text-cinema-muted"
            onKeyDown={(e) => {
              if (e.key === 'Escape') setCommandOpen(false);
              if (e.key === 'Enter' && items[0]) {
                items[0].run();
                setCommandOpen(false);
              }
            }}
          />
          <kbd className="text-[10px] font-mono text-cinema-muted border border-cinema-border rounded px-1.5 py-0.5">
            esc
          </kbd>
        </div>
        <ul className="max-h-80 overflow-y-auto py-2">
          {searchQuery.isFetching && q.trim() && (
            <li className="px-4 py-2 text-[11px] text-cinema-muted">Searching project…</li>
          )}
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-cinema-raised"
                  onClick={() => {
                    item.run();
                    setCommandOpen(false);
                  }}
                >
                  <span className="h-7 w-7 rounded-md bg-cinema-bg border border-cinema-border inline-flex items-center justify-center text-cinema-muted">
                    <Icon size={14} />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13px] font-medium">{item.label}</span>
                    {item.hint && <span className="block text-[11px] text-cinema-muted">{item.hint}</span>}
                  </span>
                </button>
              </li>
            );
          })}
          {items.length === 0 && (
            <li className="px-4 py-6 text-center text-[12px] text-cinema-muted">No matching commands</li>
          )}
        </ul>
      </div>
    </div>
  );
}

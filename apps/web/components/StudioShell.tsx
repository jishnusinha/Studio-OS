'use client';

import Link from 'next/link';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, type ReactNode } from 'react';
import {
  Clapperboard,
  Film,
  FolderKanban,
  GitBranch,
  Image as ImageIcon,
  Layers,
  MapPin,
  Megaphone,
  Music2,
  AudioLines,
  Palette,
  Scissors,
  Share2,
  Users,
  Video,
  ListTodo,
  BookOpen,
  ScanSearch,
  Grid2x2,
  Workflow,
  MessageSquare,
  Sparkles,
} from 'lucide-react';
import { ContextRibbon, CostChip, Button, type ContextRibbonSegment } from '@studio-os/ui';
import { useStudioStore } from '@/lib/store';
import { AskStudioBar } from './AskStudioBar';
import { CommandPalette } from './CommandPalette';
import { Inspector } from './Inspector';
import { TimelineDock } from './TimelineDock';
import { PresenceAvatars } from './PresenceAvatars';
import clsx from 'clsx';

const NAV = [
  { href: 'story', label: 'Story', icon: BookOpen },
  { href: '', label: 'Shots', icon: Clapperboard },
  { href: 'continuity', label: 'Continuity', icon: ScanSearch },
  { href: 'commercial', label: 'Commercial', icon: Megaphone },
  { href: 'assets', label: 'Assets', icon: FolderKanban },
  { href: 'story#people', label: 'People', icon: Users },
  { href: 'story#places', label: 'Places', icon: MapPin },
  { href: 'image', label: 'Image Lab', icon: ImageIcon },
  { href: 'video', label: 'Video Lab', icon: Video },
  { href: 'audio', label: 'Audio Lab', icon: AudioLines },
  { href: 'music', label: 'Music', icon: Music2 },
  { href: 'color', label: 'Color', icon: Palette },
  { href: 'multicam', label: 'Multicam', icon: Grid2x2 },
  { href: 'edit', label: 'Edit', icon: Scissors },
  { href: 'workflows', label: 'Workflows', icon: Workflow },
  { href: 'collab', label: 'Collab', icon: MessageSquare },
  { href: 'compare', label: 'Compare', icon: Layers },
  { href: 'jobs', label: 'Jobs', icon: ListTodo },
  { href: 'lineage', label: 'Lineage', icon: GitBranch },
] as const;

export function StudioShell({ children }: { children: ReactNode }) {
  const params = useParams<{ id?: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const projectId = params.id;
  const {
    focusMode,
    toggleFocusMode,
    setCommandOpen,
    commandOpen,
    projectName,
    spendUsd,
    budgetUsd,
    selection,
  } = useStudioStore();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandOpen(true);
        return;
      }
      if (!typing && e.key === 'Tab' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        toggleFocusMode();
      }
      if (!typing && e.key === 'Escape' && commandOpen) {
        setCommandOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [commandOpen, setCommandOpen, toggleFocusMode]);

  const segments = useMemo((): ContextRibbonSegment[] => {
    const segs: ContextRibbonSegment[] = [
      { id: 'projects', label: 'Projects', onClick: () => router.push('/projects') },
      {
        id: 'project',
        label: projectName ?? 'Project',
        onClick: projectId ? () => router.push(`/projects/${projectId}`) : undefined,
      },
    ];
    if (pathname.includes('/story')) segs.push({ id: 'story', label: 'Story' });
    else if (pathname.includes('/continuity')) segs.push({ id: 'continuity', label: 'Continuity' });
    else if (pathname.includes('/commercial')) segs.push({ id: 'commercial', label: 'Commercial' });
    else if (pathname.includes('/image')) segs.push({ id: 'image', label: 'Image Lab' });
    else if (pathname.includes('/video')) segs.push({ id: 'video', label: 'Video Lab' });
    else if (pathname.includes('/audio')) segs.push({ id: 'audio', label: 'Audio Lab' });
    else if (pathname.includes('/music')) segs.push({ id: 'music', label: 'Music' });
    else if (pathname.includes('/color')) segs.push({ id: 'color', label: 'Color' });
    else if (pathname.includes('/multicam')) segs.push({ id: 'multicam', label: 'Multicam' });
    else if (pathname.includes('/edit')) segs.push({ id: 'edit', label: 'Edit' });
    else if (pathname.includes('/compare')) segs.push({ id: 'compare', label: 'Compare' });
    else if (pathname.includes('/lineage')) segs.push({ id: 'lineage', label: 'Lineage' });
    else if (pathname.includes('/jobs')) segs.push({ id: 'jobs', label: 'Jobs' });
    else if (pathname.includes('/workflows')) segs.push({ id: 'workflows', label: 'Workflows' });
    else if (pathname.includes('/collab')) segs.push({ id: 'collab', label: 'Collab' });
    else if (pathname.includes('/admin/fine-tuning')) segs.push({ id: 'fine-tuning', label: 'Fine-tuning' });
    else if (pathname.includes('/admin/models')) segs.push({ id: 'models', label: 'Models' });
    else if (pathname.includes('/admin/usage')) segs.push({ id: 'usage', label: 'Usage' });
    else if (projectId) segs.push({ id: 'board', label: 'Cinema Board' });
    if (selection.kind === 'shot' && selection.label) {
      segs.push({ id: 'shot', label: selection.label });
    }
    return segs;
  }, [pathname, projectId, projectName, router, selection.kind, selection.label]);

  const base = projectId ? `/projects/${projectId}` : '/projects';

  return (
    <div
      className={clsx(
        'h-screen w-screen overflow-hidden bg-cinema-bg text-cinema-text flex flex-col',
        focusMode && 'studio-focus-chrome-hidden',
      )}
    >
      <header
        data-chrome
        className="h-11 shrink-0 border-b border-cinema-border bg-cinema-panel/90 backdrop-blur px-3 flex items-center gap-3"
      >
        <Link href="/projects" className="flex items-center gap-2 shrink-0 pr-2 border-r border-cinema-border">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded bg-cinema-accent/15 text-cinema-accent">
            <Film size={14} />
          </span>
          <span className="text-[13px] font-semibold tracking-wide">StudioOS</span>
        </Link>
        <ContextRibbon segments={segments} />
        <div className="flex items-center gap-2 shrink-0">
          <PresenceAvatars />
          <CostChip amountUsd={spendUsd} budgetUsd={budgetUsd} label="Spend" />
          <Button size="sm" variant="secondary" leftIcon={<Share2 size={13} />}>
            Share
          </Button>
          <kbd className="hidden md:inline-flex items-center gap-1 rounded border border-cinema-border bg-cinema-bg px-1.5 py-0.5 text-[10px] text-cinema-muted font-mono">
            Tab focus · ⌘K
          </kbd>
        </div>
      </header>

      <div className="flex-1 min-h-0 flex">
        <aside
          data-chrome
          className="w-[188px] shrink-0 border-r border-cinema-border bg-cinema-panel flex flex-col"
        >
          <div className="px-3 pt-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-cinema-muted">
            {projectId ? 'Project' : 'Studio'}
          </div>
          <nav className="flex-1 overflow-y-auto px-2 pb-3 space-y-0.5">
            {!projectId && (
              <Link
                href="/projects"
                className="flex items-center gap-2 rounded-md px-2.5 py-[7px] text-[12.5px] bg-cinema-accent/10 text-cinema-accent"
              >
                <Clapperboard size={14} />
                Projects
              </Link>
            )}
            {projectId &&
              NAV.map((item) => {
                const pathPart = item.href.split('#')[0] ?? '';
                const href = pathPart ? `${base}/${pathPart}` : base;
                const active =
                  pathPart === ''
                    ? pathname === base || pathname === `${base}/`
                    : pathname.includes(`/${pathPart}`);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.label}
                    href={href}
                    className={clsx(
                      'flex items-center gap-2 rounded-md px-2.5 py-[7px] text-[12.5px] transition-colors',
                      active
                        ? 'bg-cinema-accent/10 text-cinema-accent'
                        : 'text-cinema-muted hover:bg-cinema-raised hover:text-cinema-text',
                    )}
                  >
                    <Icon size={14} />
                    {item.label}
                  </Link>
                );
              })}
          </nav>
          <div className="border-t border-cinema-border p-2 space-y-0.5">
            <Link
              href="/admin/models"
              className="flex items-center gap-2 rounded-md px-2.5 py-[7px] text-[12px] text-cinema-muted hover:bg-cinema-raised hover:text-cinema-text"
            >
              <Layers size={14} /> Models
            </Link>
            <Link
              href="/admin/fine-tuning"
              className="flex items-center gap-2 rounded-md px-2.5 py-[7px] text-[12px] text-cinema-muted hover:bg-cinema-raised hover:text-cinema-text"
            >
              <Sparkles size={14} /> Fine-tuning
            </Link>
            <Link
              href="/admin/usage"
              className="flex items-center gap-2 rounded-md px-2.5 py-[7px] text-[12px] text-cinema-muted hover:bg-cinema-raised hover:text-cinema-text"
            >
              <ListTodo size={14} /> Usage
            </Link>
          </div>
        </aside>

        <main className="flex-1 min-w-0 min-h-0 flex flex-col bg-cinema-bg">
          <div className="flex-1 min-h-0 overflow-hidden">{children}</div>
          <div data-chrome>
            <TimelineDock />
          </div>
          <div data-chrome>
            <AskStudioBar />
          </div>
        </main>

        <aside data-chrome className="w-[300px] shrink-0 border-l border-cinema-border bg-cinema-panel min-h-0">
          <Inspector />
        </aside>
      </div>

      <CommandPalette />

      {focusMode && (
        <button
          type="button"
          onClick={toggleFocusMode}
          className="fixed bottom-3 right-3 z-50 rounded-md border border-cinema-border bg-cinema-panel px-2.5 py-1.5 text-[11px] text-cinema-muted shadow-cinema"
        >
          Focus Mode · Tab to exit
        </button>
      )}
    </div>
  );
}

'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Panel, Spinner, Badge, StatusChip } from '@studio-os/ui';
import { storyApi } from '@/lib/api';

export default function StoryPage() {
  const params = useParams<{ id: string }>();
  const { data, isLoading, error } = useQuery({
    queryKey: ['story', params.id],
    queryFn: () => storyApi.get(params.id),
  });

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Spinner label="Loading story…" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 text-[13px] text-cinema-muted">
        {(error as Error)?.message ?? 'Story unavailable'}
      </div>
    );
  }

  const bible = data.script?.storyBible ?? {};

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.14em] text-cinema-muted font-semibold">Story Room</div>
          <h1 className="text-[18px] font-semibold">{data.script?.title ?? 'Untitled script'}</h1>
        </div>
        <Badge tone="info">{data.scenes.length} scenes</Badge>
      </div>

      <div className="grid lg:grid-cols-3 gap-3">
        <Panel title="Story bible" className="lg:col-span-2">
          <dl className="space-y-2 text-[13px]">
            {(['premise', 'genre', 'tone', 'visualLanguage', 'dialogueStyle'] as const).map((key) => {
              const val = bible[key];
              if (!val) return null;
              return (
                <div key={key}>
                  <dt className="text-[10px] uppercase tracking-[0.1em] text-cinema-muted">{key}</dt>
                  <dd className="mt-0.5 text-cinema-text">{String(val)}</dd>
                </div>
              );
            })}
            {Array.isArray(bible.themes) && (
              <div>
                <dt className="text-[10px] uppercase tracking-[0.1em] text-cinema-muted">Themes</dt>
                <dd className="mt-1 flex flex-wrap gap-1.5">
                  {(bible.themes as string[]).map((t) => (
                    <Badge key={t} tone="neutral">
                      {t}
                    </Badge>
                  ))}
                </dd>
              </div>
            )}
          </dl>
          {data.script?.content && (
            <pre className="mt-4 whitespace-pre-wrap font-mono text-[12px] leading-relaxed text-cinema-muted border-t border-cinema-border pt-3">
              {data.script.content}
            </pre>
          )}
        </Panel>

        <div className="space-y-3" id="people">
          <Panel title="People" subtitle="Characters">
            <ul className="space-y-2">
              {data.characters.map((c) => (
                <li key={c.id} className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-[13px] font-medium">{c.name}</div>
                    {c.bio && <div className="text-[11px] text-cinema-muted">{c.bio}</div>}
                  </div>
                  {c.locked && <StatusChip status="locked" />}
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title="Places" subtitle="Locations" id="places">
            <ul className="space-y-2">
              {data.locations.map((l) => (
                <li key={l.id}>
                  <div className="text-[13px] font-medium">{l.name}</div>
                  {l.description && <div className="text-[11px] text-cinema-muted">{l.description}</div>}
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title="Locked facts" id="assets">
            <ul className="space-y-2">
              {data.lockedFacts.map((f) => (
                <li key={f.id} className="text-[12px]">
                  <span className="text-cinema-accent font-mono">{f.key}</span>
                  <span className="text-cinema-muted"> · </span>
                  {f.value}
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}

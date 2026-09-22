'use client';

import { useParams } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { MonitorFromTimeline } from '@/components/editor';
import { timelinesApi } from '@/lib/api';
import { useStudioStore } from '@/lib/store';

export default function EditPage() {
  const params = useParams<{ id: string }>();
  const timeline = useStudioStore((s) => s.activeTimeline);
  const playhead = useStudioStore((s) => s.timelinePlayhead);

  const renderMutation = useMutation({
    mutationFn: (preset: string) =>
      timelinesApi.render(timeline!.id, {
        preset,
        name: `${timeline?.name ?? 'Edit'} ${preset}`,
      }),
  });

  const presets = ['16:9', '9:16', '1:1', '4:5', '2.39:1', '16:9_15s', '9:16_30s'];

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="border-b border-cinema-border px-4 py-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[11px] uppercase tracking-[0.14em] text-cinema-muted font-semibold">
            Edit
          </div>
          <h1 className="text-[16px] font-semibold">Program monitor</h1>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {presets.map((p) => (
            <button
              key={p}
              type="button"
              disabled={!timeline?.id || renderMutation.isPending}
              onClick={() => renderMutation.mutate(p)}
              className="text-[10px] px-2 py-1 rounded border border-cinema-border hover:border-cinema-accent disabled:opacity-40"
            >
              Render {p}
            </button>
          ))}
          {renderMutation.data && (
            <span className="text-[11px] text-cinema-muted font-mono">
              deliverable {(renderMutation.data as { id: string }).id?.slice(0, 8)}…
            </span>
          )}
        </div>
      </div>
      <div className="flex-1 min-h-0 studio-grid-bg relative flex items-center justify-center p-6 overflow-auto">
        <div className="w-full max-w-4xl">
          <MonitorFromTimeline timeline={timeline} playhead={playhead} />
          {!timeline && (
            <p className="text-center text-[12px] text-cinema-muted mt-3">
              Create or select a timeline in the dock below (project {params.id}).
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

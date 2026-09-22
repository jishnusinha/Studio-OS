'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { ProgressBar, StatusChip, Spinner, Badge, friendlyModelLabel } from '@studio-os/ui';
import { API_URL, jobsApi, asNumber, type GenerationJobDto } from '@/lib/api';
import { useStudioStore } from '@/lib/store';

export default function JobsPage() {
  const params = useParams<{ id: string }>();
  const setSelection = useStudioStore((s) => s.setSelection);
  const [jobs, setJobs] = useState<GenerationJobDto[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let es: EventSource | null = null;
    let cancelled = false;

    const boot = async () => {
      try {
        const initial = await jobsApi.list({ projectId: params.id });
        if (!cancelled) {
          setJobs(initial);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError((err as Error).message);
          setLoading(false);
        }
      }

      // Cookie auth: EventSource sends credentials same-origin; cross-origin needs proxy.
      const url = `${API_URL}/projects/${params.id}/jobs/stream`;
      es = new EventSource(url, { withCredentials: true } as EventSourceInit);
      es.onopen = () => {
        if (!cancelled) setConnected(true);
      };
      es.onmessage = (ev) => {
        try {
          const payload = JSON.parse(ev.data) as { jobs?: GenerationJobDto[] };
          if (payload.jobs && !cancelled) {
            setJobs(payload.jobs as GenerationJobDto[]);
            setError(null);
          }
        } catch {
          // ignore malformed frames
        }
      };
      es.onerror = () => {
        if (!cancelled) setConnected(false);
      };
    };

    void boot();
    return () => {
      cancelled = true;
      es?.close();
    };
  }, [params.id]);

  const cancelMutation = useMutation({
    mutationFn: (id: string) => jobsApi.cancel(id),
  });
  const retryMutation = useMutation({
    mutationFn: (id: string) => jobsApi.retry(id),
  });
  const priorityMutation = useMutation({
    mutationFn: ({ id, priority }: { id: string; priority: number }) =>
      jobsApi.reprioritize(id, priority),
  });

  return (
    <div className="h-full overflow-y-auto">
      <div className="border-b border-cinema-border px-4 py-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.14em] text-cinema-muted font-semibold">
            Generation Center
          </div>
          <h1 className="text-[16px] font-semibold">Jobs</h1>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={connected ? 'accent' : 'neutral'}>
            {connected ? 'Live SSE' : 'Connecting…'}
          </Badge>
          <Badge tone="neutral">{jobs.length} jobs</Badge>
        </div>
      </div>

      <div className="p-4 space-y-2">
        {loading && (
          <div className="py-12 flex justify-center">
            <Spinner label="Loading jobs…" />
          </div>
        )}
        {error && (
          <div className="rounded-md border border-cinema-danger/30 bg-cinema-danger/10 px-3 py-2 text-[12px] text-cinema-danger">
            {error}
          </div>
        )}
        {!loading && jobs.length === 0 && !error && (
          <div className="rounded-lg border border-dashed border-cinema-border p-10 text-center text-[13px] text-cinema-muted">
            No generation jobs yet. Run an estimate + generate from Image or Video Lab.
          </div>
        )}
        {jobs.map((job) => {
          const failed = job.status === 'failed';
          const done = job.status === 'completed';
          const cancelled = job.status === 'cancelled';
          return (
            <div
              key={job.id}
              className="rounded-lg border border-cinema-border bg-cinema-panel px-3 py-3 grid md:grid-cols-[1fr_240px] gap-3 cursor-pointer"
              onClick={() =>
                setSelection({
                  kind: 'job',
                  id: job.id,
                  label: job.capability,
                  meta: job as unknown as Record<string, unknown>,
                })
              }
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[13px] font-semibold font-mono truncate">{job.capability}</span>
                  <StatusChip
                    status={failed ? 'failed' : done ? 'ready' : cancelled ? 'cancelled' : 'generating'}
                    label={job.status}
                  />
                </div>
                <div className="mt-1 text-[11px] text-cinema-muted font-mono truncate">
                  {job.id}
                  {job.modelId ? ` · ${friendlyModelLabel(job.modelId)}` : ''}
                  {'priority' in job && job.priority != null ? ` · p${(job as { priority?: number }).priority}` : ''}
                </div>
                <div className="mt-3">
                  <ProgressBar
                    value={asNumber(job.progress)}
                    tone={failed ? 'danger' : done ? 'accent' : 'info'}
                    label="Progress"
                  />
                </div>
                {job.error && <p className="mt-2 text-[12px] text-cinema-danger">{job.error}</p>}
              </div>
              <div className="text-[11px] text-cinema-muted space-y-2 md:text-right font-mono">
                <div>est ${asNumber(job.estimatedCostUsd).toFixed(2)}</div>
                <div>
                  actual $
                  {job.actualCostUsd != null ? asNumber(job.actualCostUsd).toFixed(2) : '—'}
                </div>
                <div>{job.createdAt ? new Date(job.createdAt).toLocaleString() : '—'}</div>
                <div className="flex md:justify-end flex-wrap gap-1.5 pt-1" onClick={(e) => e.stopPropagation()}>
                  {!done && !failed && !cancelled && (
                    <button
                      type="button"
                      className="h-7 px-2 rounded border border-cinema-border text-[10px] hover:text-cinema-text"
                      onClick={() => cancelMutation.mutate(job.id)}
                    >
                      Cancel
                    </button>
                  )}
                  {(failed || cancelled) && (
                    <button
                      type="button"
                      className="h-7 px-2 rounded border border-cinema-border text-[10px] hover:text-cinema-text"
                      onClick={() => retryMutation.mutate(job.id)}
                    >
                      Retry
                    </button>
                  )}
                  {!done && (
                    <button
                      type="button"
                      className="h-7 px-2 rounded border border-cinema-border text-[10px] hover:text-cinema-text"
                      onClick={() =>
                        priorityMutation.mutate({
                          id: job.id,
                          priority: ((job as { priority?: number }).priority ?? 0) + 10,
                        })
                      }
                    >
                      Prioritize
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { Sparkles, AtSign, CornerDownLeft, Loader2 } from 'lucide-react';
import { useStudioStore } from '@/lib/store';
import { agentApi } from '@/lib/api';

export function AskStudioBar() {
  const [value, setValue] = useState('');
  const [preview, setPreview] = useState<{
    summary: string;
    confirmationToken: string;
    plannedToolCalls: Array<{ tool: string; estimatedCostUsd: number }>;
    costRange?: { minUsd: number; maxUsd: number };
    estimatedCostMinUsd?: number;
    estimatedCostMaxUsd?: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const setCommandOpen = useStudioStore((s) => s.setCommandOpen);
  const selection = useStudioStore((s) => s.selection);
  const params = useParams<{ id?: string }>();
  const projectId = params.id;

  const previewMutation = useMutation({
    mutationFn: (message: string) =>
      agentApi.preview({
        projectId: projectId!,
        message,
        selection: {
          shotId: selection.kind === 'shot' ? selection.id ?? undefined : undefined,
          sceneId: selection.kind === 'scene' ? selection.id ?? undefined : undefined,
        },
      }),
    onSuccess: (data) => {
      setError(null);
      setPreview(data);
    },
    onError: (err) => {
      setPreview(null);
      setError((err as Error).message);
    },
  });

  const executeMutation = useMutation({
    mutationFn: (confirmationToken: string) => agentApi.execute({ confirmationToken }),
    onSuccess: () => {
      setPreview(null);
      setValue('');
      setError(null);
    },
    onError: (err) => setError((err as Error).message),
  });

  const submit = () => {
    if (!value.trim() || !projectId) {
      setCommandOpen(true);
      return;
    }
    previewMutation.mutate(value.trim());
  };

  return (
    <div className="border-t border-cinema-border bg-cinema-panel">
      {preview && (
        <div className="px-3 pt-2 pb-1 border-b border-cinema-border/60">
          <div className="rounded-md border border-cinema-border bg-cinema-bg px-3 py-2 text-[12px]">
            <div className="font-medium text-cinema-text mb-1">{preview.summary}</div>
            <div className="text-cinema-muted mb-2">
              Cost ${(preview.costRange?.minUsd ?? preview.estimatedCostMinUsd ?? 0).toFixed(2)}–
              ${(preview.costRange?.maxUsd ?? preview.estimatedCostMaxUsd ?? 0).toFixed(2)} ·{' '}
              {preview.plannedToolCalls.map((c) => c.tool).join(', ')}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={executeMutation.isPending}
                onClick={() => executeMutation.mutate(preview.confirmationToken)}
                className="h-7 px-2.5 rounded-md bg-cinema-accent text-black text-[11px] font-semibold disabled:opacity-50"
              >
                {executeMutation.isPending ? 'Executing…' : 'Execute'}
              </button>
              <button
                type="button"
                onClick={() => setPreview(null)}
                className="h-7 px-2.5 rounded-md border border-cinema-border text-[11px] text-cinema-muted"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      {error && (
        <div className="px-3 pt-1 text-[11px] text-cinema-danger">{error}</div>
      )}
      <div className="h-12 px-3 flex items-center gap-2">
        <div className="flex items-center gap-2 text-cinema-accent shrink-0">
          <Sparkles size={15} />
          <span className="text-[12px] font-semibold tracking-wide hidden sm:inline">Ask Studio</span>
        </div>
        <div className="flex-1 min-w-0 relative">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && value.trim()) submit();
            }}
            placeholder={
              selection.label
                ? `Ask about ${selection.label}…  @character  @scene`
                : 'Ask StudioOS…  @Sarah  @Scene17'
            }
            className="w-full h-8 rounded-md border border-cinema-border bg-cinema-bg px-3 pr-20 text-[13px] text-cinema-text placeholder:text-cinema-muted/70 outline-none focus:border-cinema-accent/40"
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-cinema-muted">
            <AtSign size={12} />
            <kbd className="rounded border border-cinema-border px-1 py-0.5 text-[10px] font-mono flex items-center gap-0.5">
              ⌘K
            </kbd>
          </div>
        </div>
        <button
          type="button"
          onClick={submit}
          disabled={previewMutation.isPending}
          className="h-8 px-2.5 rounded-md border border-cinema-border bg-cinema-raised text-cinema-muted hover:text-cinema-text text-[12px] inline-flex items-center gap-1"
        >
          {previewMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <CornerDownLeft size={12} />}
          {projectId ? 'Ask' : 'Command'}
        </button>
        <button
          type="button"
          onClick={() => setCommandOpen(true)}
          className="h-8 px-2.5 rounded-md border border-cinema-border text-cinema-muted hover:text-cinema-text text-[12px]"
        >
          ⌘K
        </button>
      </div>
    </div>
  );
}

'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Panel, StatusChip } from '@studio-os/ui';
import { useMemo, useState } from 'react';
import { asNumber, commercialApi, type VariantCellDto } from '@/lib/api';

function cellKey(c: Pick<VariantCellDto, 'format' | 'language' | 'durationSec'>) {
  return `${c.format}|${c.language}|${c.durationSec}`;
}

export function VariantFactory({ campaignId }: { campaignId: string | null }) {
  const qc = useQueryClient();
  const matrixQuery = useQuery({
    queryKey: ['variant-matrix', campaignId],
    queryFn: () => commercialApi.variantMatrix(campaignId!),
    enabled: Boolean(campaignId),
  });

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [estimate, setEstimate] = useState<{ totalUsd: number; cellCount: number } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const cells = matrixQuery.data?.cells ?? [];
  const formats = matrixQuery.data?.formats ?? [];
  const languages = matrixQuery.data?.languages ?? [];
  const durations = matrixQuery.data?.durations ?? [];

  const byKey = useMemo(() => new Map(cells.map((c) => [cellKey(c), c])), [cells]);

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setEstimate(null);
  };

  const selectMissing = () => {
    setSelected(new Set(cells.filter((c) => c.status === 'missing').map(cellKey)));
    setEstimate(null);
  };

  const selectedCells = useMemo(
    () => cells.filter((c) => selected.has(cellKey(c))),
    [cells, selected],
  );

  const estimateMut = useMutation({
    mutationFn: () =>
      commercialApi.estimateVariants(
        campaignId!,
        selectedCells.map((c) => ({
          format: c.format,
          language: c.language,
          durationSec: c.durationSec,
        })),
      ),
    onSuccess: (r) => {
      setEstimate({ totalUsd: r.totalUsd, cellCount: r.cellCount });
      setMsg(null);
    },
    onError: (e: Error) => setMsg(e.message),
  });

  const generateMut = useMutation({
    mutationFn: () =>
      commercialApi.generateVariants(campaignId!, {
        cells: selectedCells.map((c) => ({
          format: c.format,
          language: c.language,
          durationSec: c.durationSec,
        })),
        selective: true,
        regenerateBeats: ['HOOK', 'CTA'],
      }),
    onSuccess: () => {
      setMsg('Variant generation queued (Hook/CTA only; middle beats reused)');
      void qc.invalidateQueries({ queryKey: ['variant-matrix', campaignId] });
    },
    onError: (e: Error) => setMsg(e.message),
  });

  if (!campaignId) {
    return (
      <Panel title="Variant Factory" subtitle="Select a campaign first">
        <p className="text-[12px] text-cinema-muted">
          Create or select a campaign to open the format × language × duration matrix.
        </p>
      </Panel>
    );
  }

  return (
    <Panel
      title="Variant Factory"
      subtitle="Matrix · selective Hook/CTA regen · localization branch"
    >
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {matrixQuery.data?.summary && (
          <>
            <Badge tone="neutral">{matrixQuery.data.summary.missing} missing</Badge>
            <Badge tone="info">{matrixQuery.data.summary.ready} ready</Badge>
            <Badge tone="warning">{matrixQuery.data.summary.generating} generating</Badge>
          </>
        )}
        <Button size="sm" variant="ghost" onClick={selectMissing}>
          Select missing
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={selectedCells.length === 0 || estimateMut.isPending}
          onClick={() => estimateMut.mutate()}
        >
          Estimate
        </Button>
        <Button
          size="sm"
          disabled={selectedCells.length === 0 || generateMut.isPending}
          onClick={() => generateMut.mutate()}
        >
          Generate selected
        </Button>
      </div>

      {estimate && (
        <p className="mb-2 text-[12px]">
          Batch estimate: <strong>${estimate.totalUsd.toFixed(2)}</strong> for {estimate.cellCount}{' '}
          missing cells (selective)
        </p>
      )}
      {msg && <p className="mb-2 text-[12px] text-cinema-muted">{msg}</p>}

      <div className="overflow-x-auto">
        <table className="w-full text-[11px] border-collapse min-w-[640px]">
          <thead>
            <tr>
              <th className="text-left p-1.5 text-cinema-muted font-medium">Format / Lang</th>
              {durations.map((d) => (
                <th key={d} className="p-1.5 text-cinema-muted font-medium text-center">
                  {d}s
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {formats.map((format) =>
              languages.map((language) => (
                <tr key={`${format}-${language}`} className="border-t border-cinema-border">
                  <td className="p-1.5 whitespace-nowrap">
                    <span className="font-mono">{format}</span>
                    <span className="text-cinema-muted"> · {language}</span>
                  </td>
                  {durations.map((durationSec) => {
                    const key = cellKey({ format, language, durationSec });
                    const cell = byKey.get(key);
                    const status = cell?.status ?? 'missing';
                    const isSelected = selected.has(key);
                    return (
                      <td key={key} className="p-1 text-center">
                        <button
                          type="button"
                          onClick={() => toggle(key)}
                          className={`w-full min-w-[72px] rounded border px-1 py-1.5 ${
                            isSelected
                              ? 'border-cinema-accent bg-cinema-accent/15'
                              : 'border-cinema-border hover:bg-cinema-raised'
                          }`}
                        >
                          <StatusChip
                            status={
                              status === 'ready'
                                ? 'ready'
                                : status === 'generating'
                                  ? 'generating'
                                  : 'draft'
                            }
                            label={status}
                          />
                          {cell?.estimatedCostUsd != null && (
                            <div className="mt-0.5 text-[9px] text-cinema-muted">
                              ${asNumber(cell.estimatedCostUsd).toFixed(2)}
                            </div>
                          )}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              )),
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[11px] text-cinema-muted">
        Selective generate reuses locked middle beats and only regenerates Hook + CTA. Localization
        (dubs / captions / layout / claims) is tracked via branchId on each variant.
      </p>
    </Panel>
  );
}

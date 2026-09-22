'use client';

import { useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Spinner, Panel } from '@studio-os/ui';
import { assetsApi, type AssetDto } from '@/lib/api';
import { StorageModeChip } from '@/components/editor/StorageModeChip';
import { useStudioStore } from '@/lib/store';

const FACET_KEYS = ['type', 'character', 'scene', 'status', 'model', 'source', 'rating'] as const;
type FacetKey = (typeof FACET_KEYS)[number];

function uniqueValues(assets: AssetDto[], key: FacetKey): string[] {
  const set = new Set<string>();
  for (const a of assets) {
    const meta = a.metadata ?? {};
    let v: unknown;
    if (key === 'type') v = a.type;
    else if (key === 'status') v = a.status;
    else if (key === 'rating') v = a.rating;
    else if (key === 'character') v = meta.character ?? meta.characterId;
    else if (key === 'scene') v = meta.sceneId ?? meta.scene;
    else if (key === 'model') v = meta.modelId;
    else if (key === 'source') v = meta.source ?? meta.providerId;
    if (v != null && v !== '') set.add(String(v));
  }
  return [...set].sort();
}

export default function AssetsPage() {
  const params = useParams<{ id: string }>();
  const setSelection = useStudioStore((s) => s.setSelection);
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [facets, setFacets] = useState<Partial<Record<FacetKey, string>>>({});
  const [hoverId, setHoverId] = useState<string | null>(null);

  const uploadMutation = useMutation({
    mutationFn: (file: File) => {
      const type = file.type.startsWith('audio/')
        ? 'audio'
        : file.type.startsWith('image/')
          ? 'image'
          : file.type.startsWith('video/')
            ? 'video'
            : 'other';
      return assetsApi.uploadFile(params.id, file, type);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['assets', params.id] }),
  });

  const allQuery = useQuery({
    queryKey: ['assets', params.id],
    queryFn: () => assetsApi.list(params.id),
  });

  const filteredQuery = useQuery({
    queryKey: ['assets', params.id, facets],
    queryFn: () =>
      assetsApi.list(params.id, {
        type: facets.type,
        status: facets.status,
        character: facets.character,
        scene: facets.scene,
        model: facets.model,
        source: facets.source,
        rating: facets.rating,
      }),
  });

  const allAssets = (allQuery.data ?? []) as AssetDto[];
  const assets = (filteredQuery.data ?? allAssets) as AssetDto[];

  const facetOptions = useMemo(() => {
    const map: Record<FacetKey, string[]> = {
      type: [],
      character: [],
      scene: [],
      status: [],
      model: [],
      source: [],
      rating: [],
    };
    for (const key of FACET_KEYS) map[key] = uniqueValues(allAssets, key);
    return map;
  }, [allAssets]);

  const hoverAsset = assets.find((a) => a.id === hoverId) ?? null;
  const previewQuery = useQuery({
    queryKey: ['asset-preview', hoverId],
    queryFn: () => assetsApi.signedUrl(hoverId!, 'thumbnail'),
    enabled: Boolean(hoverId),
    retry: false,
  });

  return (
    <div className="h-full overflow-y-auto">
      <div className="border-b border-cinema-border px-4 py-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.14em] text-cinema-muted font-semibold">
            Library
          </div>
          <h1 className="text-[16px] font-semibold">Assets</h1>
        </div>
        <div className="flex items-center gap-2">
          <StorageModeChip />
          <button
            type="button"
            className="text-[12px] px-3 py-1.5 rounded border border-cinema-accent text-cinema-accent disabled:opacity-40"
            disabled={uploadMutation.isPending}
            onClick={() => inputRef.current?.click()}
          >
            {uploadMutation.isPending ? 'Uploading…' : 'Import media'}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="video/*,audio/*,image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadMutation.mutate(f);
              e.target.value = '';
            }}
          />
          <Badge tone="neutral">{assets.length} items</Badge>
        </div>
      </div>

      <div className="p-4 grid lg:grid-cols-[220px_1fr] gap-4">
        <aside className="space-y-3">
          <Panel title="Facets" flush>
            <div className="space-y-3 p-3">
              {FACET_KEYS.map((key) => (
                <label key={key} className="block">
                  <span className="text-[10px] uppercase tracking-[0.1em] text-cinema-muted">
                    {key}
                  </span>
                  <select
                    className="mt-1 w-full h-8 rounded-md border border-cinema-border bg-cinema-bg text-[12px] px-2"
                    value={facets[key] ?? ''}
                    onChange={(e) =>
                      setFacets((prev) => {
                        const next = { ...prev };
                        if (e.target.value) next[key] = e.target.value;
                        else delete next[key];
                        return next;
                      })
                    }
                  >
                    <option value="">Any</option>
                    {facetOptions[key].map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
              <button
                type="button"
                className="text-[11px] text-cinema-muted hover:text-cinema-text"
                onClick={() => setFacets({})}
              >
                Clear facets
              </button>
            </div>
          </Panel>

          {hoverAsset && (
            <Panel title="Preview" subtitle={hoverAsset.name} flush>
              <div className="aspect-video bg-cinema-bg border-t border-cinema-border flex items-center justify-center overflow-hidden">
                {previewQuery.data?.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={previewQuery.data.url}
                    alt={hoverAsset.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-[11px] text-cinema-muted font-mono">{hoverAsset.type}</span>
                )}
              </div>
            </Panel>
          )}
        </aside>

        <div>
          {(allQuery.isLoading || filteredQuery.isLoading) && (
            <div className="py-12 flex justify-center">
              <Spinner label="Loading assets…" />
            </div>
          )}
          {!allQuery.isLoading && assets.length === 0 && (
            <div className="rounded-lg border border-dashed border-cinema-border p-10 text-center text-[13px] text-cinema-muted">
              No assets match these facets.
            </div>
          )}
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {assets.map((asset) => (
              <button
                key={asset.id}
                type="button"
                className="text-left rounded-lg border border-cinema-border bg-cinema-panel p-3 hover:border-cinema-accent/40 transition-colors"
                onMouseEnter={() => setHoverId(asset.id)}
                onMouseLeave={() => setHoverId((id) => (id === asset.id ? null : id))}
                onClick={() =>
                  setSelection({
                    kind: 'asset',
                    id: asset.id,
                    label: asset.name,
                    meta: asset as unknown as Record<string, unknown>,
                  })
                }
              >
                <div className="aspect-video rounded-md bg-cinema-bg border border-cinema-border mb-2 flex items-center justify-center text-[11px] text-cinema-muted font-mono">
                  {asset.type}
                </div>
                <div className="text-[13px] font-medium truncate">{asset.name}</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  <Badge tone="neutral">{asset.status ?? 'draft'}</Badge>
                  {asset.rating != null && <Badge tone="accent">{asset.rating}★</Badge>}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

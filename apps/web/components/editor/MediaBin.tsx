'use client';

import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Upload } from 'lucide-react';
import { assetsApi, type AssetDto } from '@/lib/api';
import { useProxyUrl } from './ProgramMonitor';

function guessAssetType(file: File): 'image' | 'video' | 'audio' | 'other' {
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  if (file.type.startsWith('image/')) return 'image';
  return 'other';
}

export function MediaBin({
  projectId,
  selectedId,
  onSelect,
  onAddToTimeline,
}: {
  projectId: string;
  selectedId: string | null;
  onSelect: (asset: AssetDto | null) => void;
  onAddToTimeline: (asset: AssetDto) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState('');

  const listQuery = useQuery({
    queryKey: ['assets', projectId],
    queryFn: () => assetsApi.list(projectId),
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => assetsApi.uploadFile(projectId, file, guessAssetType(file)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['assets', projectId] }),
  });

  const assets = useMemo(() => {
    const rows = (listQuery.data ?? []) as AssetDto[];
    const q = filter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((a) => a.name.toLowerCase().includes(q) || a.type.includes(q));
  }, [listQuery.data, filter]);

  return (
    <div className="flex h-full min-h-0 flex-col border border-cinema-border rounded-lg bg-cinema-panel/40">
      <div className="flex items-center justify-between gap-2 border-b border-cinema-border px-3 py-2">
        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-cinema-muted">
          Media bin
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded border border-cinema-border px-2 py-1 text-[11px] text-cinema-accent hover:border-cinema-accent disabled:opacity-40"
          disabled={uploadMutation.isPending}
          onClick={() => inputRef.current?.click()}
        >
          <Upload size={12} />
          Import
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
      </div>
      <div className="px-3 py-2">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter…"
          className="w-full rounded border border-cinema-border bg-cinema-bg px-2 py-1.5 text-[12px] outline-none focus:border-cinema-accent"
        />
      </div>
      <div className="flex-1 min-h-0 overflow-auto px-2 pb-2 space-y-1">
        {assets.map((asset) => (
          <BinRow
            key={asset.id}
            asset={asset}
            active={selectedId === asset.id}
            onSelect={() => onSelect(asset)}
            onAdd={() => onAddToTimeline(asset)}
          />
        ))}
        {!assets.length && (
          <p className="px-2 py-6 text-center text-[12px] text-cinema-muted">
            Import media to begin editing.
          </p>
        )}
      </div>
      {uploadMutation.isPending && (
        <div className="border-t border-cinema-border px-3 py-2 text-[11px] text-cinema-muted">
          Uploading…
        </div>
      )}
    </div>
  );
}

function BinRow({
  asset,
  active,
  onSelect,
  onAdd,
}: {
  asset: AssetDto;
  active: boolean;
  onSelect: () => void;
  onAdd: () => void;
}) {
  const thumb = useProxyUrl(active ? asset.id : null);
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('application/x-studioos-asset', JSON.stringify(asset));
        e.dataTransfer.effectAllowed = 'copy';
      }}
      className={`flex items-center gap-2 rounded border px-2 py-1.5 cursor-pointer ${
        active ? 'border-cinema-accent bg-cinema-accent/10' : 'border-transparent hover:border-cinema-border'
      }`}
      onClick={onSelect}
      onDoubleClick={onAdd}
    >
      <div className="h-9 w-12 shrink-0 overflow-hidden rounded bg-cinema-bg">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-[9px] uppercase text-cinema-muted">
            {asset.type.slice(0, 3)}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12px] font-medium">{asset.name}</div>
        <div className="text-[10px] text-cinema-muted">{asset.type} · {asset.status ?? '—'}</div>
      </div>
      <button
        type="button"
        className="text-[10px] text-cinema-accent px-1"
        onClick={(e) => {
          e.stopPropagation();
          onAdd();
        }}
      >
        Add
      </button>
    </div>
  );
}

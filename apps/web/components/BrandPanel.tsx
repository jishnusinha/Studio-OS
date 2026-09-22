'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Panel, StatusChip } from '@studio-os/ui';
import { useState } from 'react';
import { commercialApi, type BrandDnaDto } from '@/lib/api';

export function BrandPanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const brandQuery = useQuery({
    queryKey: ['brand', projectId],
    queryFn: () => commercialApi.getBrand(projectId),
  });
  const productsQuery = useQuery({
    queryKey: ['products', projectId],
    queryFn: () => commercialApi.listProducts(projectId),
  });

  const [source, setSource] = useState<'url' | 'kit' | 'product' | 'brief'>('url');
  const [url, setUrl] = useState('https://example.com');
  const [text, setText] = useState('');
  const [productName, setProductName] = useState('');
  const [packUrl, setPackUrl] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ingest = useMutation({
    mutationFn: () =>
      commercialApi.ingestBrand(projectId, {
        source,
        url: source === 'url' ? url : undefined,
        text: text || undefined,
        kit:
          source === 'kit'
            ? {
                colors: ['#111111', '#F5F5F5', '#E11D48'],
                fonts: ['Geist Sans'],
                voice: 'Confident, modern',
                cta: 'Shop now',
                forbiddenClaims: ['guaranteed results', 'miracle'],
              }
            : undefined,
      }),
    onSuccess: () => {
      setError(null);
      void qc.invalidateQueries({ queryKey: ['brand', projectId] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const createProduct = useMutation({
    mutationFn: () =>
      commercialApi.createProduct(projectId, {
        name: productName.trim(),
        brandId: brandQuery.data?.id,
      }),
    onSuccess: () => {
      setProductName('');
      void qc.invalidateQueries({ queryKey: ['products', projectId] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const addPackshot = useMutation({
    mutationFn: () => {
      if (!selectedProduct) throw new Error('Select a product');
      return commercialApi.addPackshot(selectedProduct, {
        url: packUrl,
        label: 'Packshot',
      });
    },
    onSuccess: () => {
      setPackUrl('');
      void qc.invalidateQueries({ queryKey: ['products', projectId] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const brand = brandQuery.data;
  const dna = (brand?.dna ?? {}) as BrandDnaDto;

  return (
    <div className="space-y-3">
      <Panel title="Brand DNA" subtitle="Ingest from URL, kit, product, or brief">
        <div className="flex flex-wrap gap-2 mb-3">
          {(['url', 'kit', 'product', 'brief'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSource(s)}
              className={`h-7 px-2.5 rounded-md border text-[11px] ${
                source === s
                  ? 'border-cinema-accent text-cinema-accent bg-cinema-accent/10'
                  : 'border-cinema-border text-cinema-muted'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        {source === 'url' && (
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://brand.example"
            className="w-full h-8 rounded-md border border-cinema-border bg-cinema-bg px-2 text-[12px] mb-2"
          />
        )}
        {(source === 'brief' || source === 'product' || source === 'url') && (
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Optional notes, claims, audience…"
            rows={3}
            className="w-full rounded-md border border-cinema-border bg-cinema-bg px-2 py-1.5 text-[12px] mb-2"
          />
        )}
        <Button size="sm" onClick={() => ingest.mutate()} disabled={ingest.isPending}>
          {ingest.isPending ? 'Ingesting…' : 'Ingest Brand DNA'}
        </Button>
        {error && <p className="mt-2 text-[12px] text-cinema-danger">{error}</p>}
      </Panel>

      {brand && (
        <Panel title={brand.name} subtitle={`v${brand.version ?? 1} · ${brand.status ?? 'draft'}`}>
          <dl className="grid sm:grid-cols-2 gap-3 text-[12px]">
            <div>
              <dt className="text-[10px] uppercase tracking-[0.1em] text-cinema-muted">Voice</dt>
              <dd className="mt-0.5">{dna.voice ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-[0.1em] text-cinema-muted">Audience</dt>
              <dd className="mt-0.5">{dna.audience ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-[0.1em] text-cinema-muted">CTA</dt>
              <dd className="mt-0.5">{dna.cta ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-[0.1em] text-cinema-muted">Colors</dt>
              <dd className="mt-1 flex flex-wrap gap-1.5">
                {(dna.colors ?? []).map((c) => (
                  <span key={c} className="inline-flex items-center gap-1">
                    <span className="h-3.5 w-3.5 rounded-sm border border-cinema-border" style={{ background: c }} />
                    <span className="font-mono text-[10px]">{c}</span>
                  </span>
                ))}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-[10px] uppercase tracking-[0.1em] text-cinema-muted">Approved claims</dt>
              <dd className="mt-1 flex flex-wrap gap-1">
                {(dna.approvedClaims ?? []).map((c) => (
                  <Badge key={c} tone="info">
                    {c}
                  </Badge>
                ))}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-[10px] uppercase tracking-[0.1em] text-cinema-muted">Forbidden claims</dt>
              <dd className="mt-1 flex flex-wrap gap-1">
                {(dna.forbiddenClaims ?? []).map((c) => (
                  <Badge key={c} tone="danger">
                    {c}
                  </Badge>
                ))}
              </dd>
            </div>
          </dl>
        </Panel>
      )}

      <Panel title="Products & packshots">
        <div className="flex gap-2 mb-3">
          <input
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
            placeholder="Product name"
            className="flex-1 h-8 rounded-md border border-cinema-border bg-cinema-bg px-2 text-[12px]"
          />
          <Button
            size="sm"
            disabled={!productName.trim() || createProduct.isPending}
            onClick={() => createProduct.mutate()}
          >
            Add
          </Button>
        </div>
        <ul className="space-y-2">
          {(productsQuery.data ?? []).map((p) => (
            <li
              key={p.id}
              className={`rounded-md border px-2.5 py-2 ${
                selectedProduct === p.id ? 'border-cinema-accent' : 'border-cinema-border'
              }`}
            >
              <button type="button" className="w-full text-left" onClick={() => setSelectedProduct(p.id)}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] font-medium">{p.name}</span>
                  <StatusChip status="draft" label={p.status ?? 'draft'} />
                </div>
                <div className="mt-1 text-[11px] text-cinema-muted">
                  {(p.packshots ?? []).length} packshot{(p.packshots ?? []).length === 1 ? '' : 's'}
                </div>
              </button>
              {(p.packshots ?? []).length > 0 && (
                <ul className="mt-2 space-y-1">
                  {(p.packshots ?? []).map((ps) => (
                    <li key={ps.id} className="text-[11px] font-mono truncate text-cinema-muted">
                      {ps.label ?? 'Packshot'} · {ps.url}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
        {selectedProduct && (
          <div className="mt-3 flex gap-2">
            <input
              value={packUrl}
              onChange={(e) => setPackUrl(e.target.value)}
              placeholder="Packshot URL"
              className="flex-1 h-8 rounded-md border border-cinema-border bg-cinema-bg px-2 text-[12px]"
            />
            <Button
              size="sm"
              variant="secondary"
              disabled={!packUrl.trim() || addPackshot.isPending}
              onClick={() => addPackshot.mutate()}
            >
              Packshot
            </Button>
          </div>
        )}
      </Panel>
    </div>
  );
}

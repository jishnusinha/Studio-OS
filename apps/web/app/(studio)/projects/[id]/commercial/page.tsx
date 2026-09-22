'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BrandPanel } from '@/components/BrandPanel';
import { CampaignBuilder } from '@/components/CampaignBuilder';
import { VariantFactory } from '@/components/VariantFactory';
import { commercialApi } from '@/lib/api';

export default function CommercialPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [tab, setTab] = useState<'brand' | 'campaign' | 'variants'>('brand');

  const campaignsQuery = useQuery({
    queryKey: ['campaigns', projectId],
    queryFn: () => commercialApi.listCampaigns(projectId),
  });

  useEffect(() => {
    if (!campaignId && campaignsQuery.data?.[0]) {
      setCampaignId(campaignsQuery.data[0].id);
    }
  }, [campaignId, campaignsQuery.data]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="border-b border-cinema-border px-4 py-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.14em] text-cinema-muted font-semibold">
            Commercial Studio
          </div>
          <h1 className="text-[16px] font-semibold">Brand · Campaign · Variants</h1>
        </div>
        <div className="flex gap-1 rounded-md border border-cinema-border p-0.5">
          {(
            [
              ['brand', 'Brand DNA'],
              ['campaign', 'Campaigns'],
              ['variants', 'Variants'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`h-7 px-2.5 rounded text-[11px] ${
                tab === id
                  ? 'bg-cinema-accent/15 text-cinema-accent'
                  : 'text-cinema-muted hover:text-cinema-text'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 max-w-[1100px]">
        {tab === 'brand' && <BrandPanel projectId={projectId} />}
        {tab === 'campaign' && (
          <CampaignBuilder
            projectId={projectId}
            selectedCampaignId={campaignId}
            onSelectCampaign={setCampaignId}
          />
        )}
        {tab === 'variants' && <VariantFactory campaignId={campaignId} />}
      </div>
    </div>
  );
}

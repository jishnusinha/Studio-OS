'use client';

import { useQuery } from '@tanstack/react-query';
import { Cloud, HardDrive } from 'lucide-react';
import { systemApi } from '@/lib/api';

export function StorageModeChip({ className = '' }: { className?: string }) {
  const q = useQuery({
    queryKey: ['system-storage'],
    queryFn: () => systemApi.storage(),
    staleTime: 60_000,
    retry: false,
  });

  const label = q.data?.label ?? '…';
  const local = q.data?.backend === 'local';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded border border-cinema-border bg-cinema-panel/70 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-cinema-muted ${className}`}
      title={
        local
          ? `Local media root: ${q.data?.localMediaRoot ?? ''}`
          : `S3 bucket: ${q.data?.s3Bucket ?? ''}`
      }
    >
      {local ? <HardDrive size={12} className="text-cinema-accent" /> : <Cloud size={12} className="text-cinema-info" />}
      {label}
    </span>
  );
}

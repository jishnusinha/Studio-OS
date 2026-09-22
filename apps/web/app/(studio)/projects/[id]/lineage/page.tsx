'use client';

import { Suspense } from 'react';
import { LineageGraph } from '@/components/LineageGraph';
import { Spinner } from '@studio-os/ui';

export default function LineagePage() {
  return (
    <Suspense
      fallback={
        <div className="h-full flex items-center justify-center">
          <Spinner label="Loading lineage…" size={18} />
        </div>
      }
    >
      <LineageGraph />
    </Suspense>
  );
}

'use client';

import { Suspense } from 'react';
import { CompareView } from '@/components/CompareView';
import { Spinner } from '@studio-os/ui';

export default function ComparePage() {
  return (
    <Suspense
      fallback={
        <div className="h-full flex items-center justify-center">
          <Spinner label="Loading compare…" size={18} />
        </div>
      }
    >
      <CompareView />
    </Suspense>
  );
}

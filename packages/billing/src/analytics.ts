import type { UsageEvent } from '@studio-os/contracts';

export type RollupKey = 'projectId' | 'modelId' | 'userId';

export interface RollupBucket {
  key: string;
  eventCount: number;
  estimatedCostUsd: number;
  customerCostUsd: number;
}

export function costPerAccepted(
  events: Array<Pick<UsageEvent, 'customerCostUsd'>>,
  acceptedCount: number,
): number {
  if (acceptedCount <= 0) return 0;
  const total = events.reduce((sum, e) => sum + e.customerCostUsd, 0);
  return total / acceptedCount;
}

export function wasteRatio(totalGens: number, acceptedGens: number): number {
  if (totalGens <= 0) return 0;
  const wasted = Math.max(0, totalGens - acceptedGens);
  return wasted / totalGens;
}

export function rollupBy(
  events: Array<Pick<UsageEvent, RollupKey | 'estimatedCostUsd' | 'customerCostUsd'>>,
  key: RollupKey,
): RollupBucket[] {
  const map = new Map<string, RollupBucket>();

  for (const event of events) {
    const bucketKey = event[key];
    const existing = map.get(bucketKey);
    if (existing) {
      existing.eventCount += 1;
      existing.estimatedCostUsd += event.estimatedCostUsd;
      existing.customerCostUsd += event.customerCostUsd;
    } else {
      map.set(bucketKey, {
        key: bucketKey,
        eventCount: 1,
        estimatedCostUsd: event.estimatedCostUsd,
        customerCostUsd: event.customerCostUsd,
      });
    }
  }

  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
}

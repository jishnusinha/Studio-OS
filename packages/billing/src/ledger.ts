import type { UsageEvent } from '@studio-os/contracts';

export type UsageEventInput = Omit<UsageEvent, 'id' | 'createdAt'> & {
  id?: string;
  createdAt?: Date;
  correctsEventId?: string;
};

export type ImmutableUsageEvent = Readonly<UsageEvent & { correctsEventId?: string }>;

export function createUsageEvent(input: UsageEventInput): ImmutableUsageEvent {
  const event: ImmutableUsageEvent = Object.freeze({
    id: input.id ?? crypto.randomUUID(),
    jobId: input.jobId,
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    userId: input.userId,
    providerId: input.providerId,
    modelId: input.modelId,
    modelVersion: input.modelVersion,
    inputTokens: input.inputTokens ?? 0,
    cachedInputTokens: input.cachedInputTokens ?? 0,
    outputTokens: input.outputTokens ?? 0,
    images: input.images ?? 0,
    outputVideoSeconds: input.outputVideoSeconds ?? 0,
    outputAudioSeconds: input.outputAudioSeconds ?? 0,
    resolution: input.resolution,
    estimatedCostUsd: input.estimatedCostUsd,
    actualProviderCostUsd: input.actualProviderCostUsd,
    customerCostUsd: input.customerCostUsd,
    varianceUsd: input.varianceUsd,
    pricingSnapshotId: input.pricingSnapshotId,
    status: input.status ?? 'completed',
    createdAt: input.createdAt ?? new Date(),
    ...(input.correctsEventId ? { correctsEventId: input.correctsEventId } : {}),
  });
  return event;
}

export type CorrectionAmounts = Partial<
  Pick<
    UsageEvent,
    | 'estimatedCostUsd'
    | 'actualProviderCostUsd'
    | 'customerCostUsd'
    | 'varianceUsd'
    | 'inputTokens'
    | 'cachedInputTokens'
    | 'outputTokens'
    | 'images'
    | 'outputVideoSeconds'
    | 'outputAudioSeconds'
  >
>;

/** Append-only correction: returns a new event that references the original. */
export function createCorrection(
  original: ImmutableUsageEvent | UsageEvent,
  newAmounts: CorrectionAmounts,
): ImmutableUsageEvent {
  return createUsageEvent({
    ...original,
    ...newAmounts,
    id: crypto.randomUUID(),
    createdAt: new Date(),
    status: 'corrected',
    correctsEventId: original.id,
  });
}

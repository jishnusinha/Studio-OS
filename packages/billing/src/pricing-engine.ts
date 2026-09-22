import type { PricingRule, PricingUnit, ProviderUsage } from '@studio-os/contracts';

export const PLATFORM_MARGIN = 1.3;

export interface PricingSnapshot {
  id: string;
  rules: PricingRule[];
  createdAt: Date;
}

export interface CostBreakdownLine {
  unit: PricingUnit;
  quantity: number;
  rateUsd: number;
  amountUsd: number;
  ruleId: string;
}

export interface CostEstimateResult {
  estimatedCostUsd: number;
  breakdown: CostBreakdownLine[];
}

export interface ReconcileResult {
  customerCostUsd: number;
  varianceUsd: number;
}

export function createPricingSnapshot(rules: PricingRule[]): PricingSnapshot {
  return {
    id: crypto.randomUUID(),
    rules: structuredClone(rules),
    createdAt: new Date(),
  };
}

function quantityForUnit(unit: PricingUnit, usage: Partial<ProviderUsage>): number {
  switch (unit) {
    case 'input_token':
      return usage.inputTokens ?? 0;
    case 'cached_token':
      return usage.cachedInputTokens ?? 0;
    case 'output_token':
      return usage.outputTokens ?? 0;
    case 'image':
      return usage.images ?? 0;
    case 'megapixel':
      return usage.megapixels ?? 0;
    case 'second':
      return (
        (usage.outputVideoSeconds ?? 0) ||
        (usage.outputAudioSeconds ?? 0) ||
        (usage.inputVideoSeconds ?? 0) ||
        (usage.inputAudioSeconds ?? 0)
      );
    case 'frame': {
      const seconds =
        (usage.outputVideoSeconds ?? 0) || (usage.inputVideoSeconds ?? 0);
      return seconds * 24;
    }
    case 'audio_minute':
      return ((usage.inputAudioSeconds ?? 0) + (usage.outputAudioSeconds ?? 0)) / 60;
    case 'character':
      return usage.inputCharacters ?? 0;
    case 'generation':
      return 1;
    case 'gpu_second':
      return (usage.outputVideoSeconds ?? 0) || (usage.inputVideoSeconds ?? 0);
    case 'storage_gb_month':
    case 'egress_gb':
      return 0;
    default:
      return 0;
  }
}

export function estimateFromRules(
  modelId: string,
  usagePartial: Partial<ProviderUsage>,
  rules: PricingRule[],
): CostEstimateResult {
  const now = new Date();
  const matching = rules.filter((rule) => {
    if (rule.modelId !== modelId) return false;
    if (rule.validFrom > now) return false;
    if (rule.validUntil != null && rule.validUntil < now) return false;
    if (usagePartial.resolution && rule.resolution && rule.resolution !== usagePartial.resolution) {
      return false;
    }
    return true;
  });

  const breakdown: CostBreakdownLine[] = [];
  let total = 0;
  let maxMinimum = 0;

  for (const rule of matching) {
    const quantity = quantityForUnit(rule.unit, usagePartial);
    const amountUsd = quantity * rule.rateUsd;
    breakdown.push({
      unit: rule.unit,
      quantity,
      rateUsd: rule.rateUsd,
      amountUsd,
      ruleId: rule.id,
    });
    total += amountUsd;
    maxMinimum = Math.max(maxMinimum, rule.minimumUsd);
  }

  const estimatedCostUsd = Math.max(total, maxMinimum);

  return { estimatedCostUsd, breakdown };
}

export function reconcile(
  estimated: number,
  actualProviderCost: number | null | undefined,
): ReconcileResult {
  const estimatedCustomer = estimated * PLATFORM_MARGIN;
  const customerCostUsd =
    actualProviderCost == null
      ? estimatedCustomer
      : actualProviderCost * PLATFORM_MARGIN;
  const varianceUsd = customerCostUsd - estimatedCustomer;
  return { customerCostUsd, varianceUsd };
}

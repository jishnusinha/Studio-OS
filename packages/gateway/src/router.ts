import type { Capability, CapabilityConstraints, PricingUnit } from '@studio-os/contracts';

export interface ModelDescriptor {
  id: string;
  providerId: string;
  capabilities: string[];
  published: boolean;
  /** Relative cost weight; lower is cheaper. Defaults to 1. */
  costWeight?: number;
  /** Relative latency weight; lower is faster. Defaults to 1. */
  latencyWeight?: number;
  /** Preferred quality modes for this model. */
  qualityModes?: string[];
}

export interface PricingRule {
  modelId: string;
  providerId: string;
  unit: PricingUnit | string;
  rateUsd: number;
  qualityMode?: string;
}

export interface RouteResult {
  modelId: string;
  providerId: string;
  reason: string[];
}

export type RouteConstraints = Partial<CapabilityConstraints> & {
  /** Prefer self-hosted providers when healthy endpoints exist (E6 stub). */
  preferSelfHosted?: boolean;
  /** Provider ids known to have healthy inference endpoints. */
  healthyProviderIds?: string[];
};

function qualityPrefersCheap(mode: string | undefined): boolean {
  return !mode || mode === 'draft';
}

export class ModelRouter {
  constructor(
    private readonly models: ModelDescriptor[],
    private readonly pricing: PricingRule[] = [],
  ) {}

  route(capability: Capability | string, constraints: RouteConstraints = {}): RouteResult {
    const reason: string[] = [];

    if (constraints.modelId) {
      const forced = this.models.find((m) => m.id === constraints.modelId);
      if (!forced) {
        throw new Error(`Unknown modelId: ${constraints.modelId}`);
      }
      if (!forced.published) {
        throw new Error(`Model is not published: ${constraints.modelId}`);
      }
      if (constraints.providerId && forced.providerId !== constraints.providerId) {
        throw new Error(
          `Model ${constraints.modelId} belongs to provider ${forced.providerId}, not ${constraints.providerId}`,
        );
      }
      reason.push(`explicit modelId=${constraints.modelId}`);
      return { modelId: forced.id, providerId: forced.providerId, reason };
    }

    let candidates = this.models.filter((m) => m.published);
    reason.push(`published candidates=${candidates.length}`);

    if (constraints.providerId) {
      candidates = candidates.filter((m) => m.providerId === constraints.providerId);
      reason.push(`filtered providerId=${constraints.providerId}`);
    }

    const capable = candidates.filter((m) => m.capabilities.includes(capability));
    if (capable.length === 0) {
      throw new Error(`No published model supports capability: ${capability}`);
    }
    reason.push(`capability fit=${capable.length}`);

    // Pool-aware routing stub: bias toward healthy self-hosted providers when requested.
    let poolPreferred = capable;
    if (constraints.preferSelfHosted && constraints.healthyProviderIds?.length) {
      const healthy = new Set(constraints.healthyProviderIds);
      const selfHosted = capable.filter((m) => healthy.has(m.providerId));
      if (selfHosted.length > 0) {
        poolPreferred = selfHosted;
        reason.push(`pool-aware prefer healthy self-hosted=${selfHosted.length}`);
      } else {
        reason.push('pool-aware: no healthy self-hosted candidates; using all capable');
      }
    }

    const qualityMode = constraints.qualityMode ?? 'draft';
    const preferCheap = qualityPrefersCheap(qualityMode);

    const scored = poolPreferred.map((model) => {
      const costWeight = model.costWeight ?? this.inferCostWeight(model.id);
      const latencyWeight = model.latencyWeight ?? 1;
      const qualityBonus =
        model.qualityModes?.includes(qualityMode) ? 2 : model.qualityModes?.length ? 0 : 1;
      const capabilityScore = model.capabilities.includes(capability) ? 10 : 0;

      // Draft / cheap path: heavily weight lower cost. Production/hero: balance quality + latency.
      const score = preferCheap
        ? capabilityScore + qualityBonus * 0.5 - costWeight * 5 - latencyWeight * 0.25
        : capabilityScore + qualityBonus * 3 - costWeight * 1.5 - latencyWeight * 1;

      return { model, score, costWeight };
    });

    scored.sort((a, b) => b.score - a.score || a.costWeight - b.costWeight);
    const best = scored[0]!;

    if (preferCheap) {
      reason.push(`prefer cheaper models for qualityMode=${qualityMode}`);
    } else {
      reason.push(`prefer quality/latency balance for qualityMode=${qualityMode}`);
    }
    reason.push(`selected ${best.model.id} (score=${best.score.toFixed(2)})`);

    if (constraints.budgetUsd != null) {
      const rate = this.cheapestRate(best.model.id);
      if (rate != null && rate > constraints.budgetUsd) {
        reason.push(`warning: indicative rate ${rate} exceeds budgetUsd=${constraints.budgetUsd}`);
      }
    }

    return {
      modelId: best.model.id,
      providerId: best.model.providerId,
      reason,
    };
  }

  private inferCostWeight(modelId: string): number {
    const rates = this.pricing.filter((p) => p.modelId === modelId).map((p) => p.rateUsd);
    if (rates.length === 0) return 1;
    return rates.reduce((a, b) => a + b, 0) / rates.length;
  }

  private cheapestRate(modelId: string): number | null {
    const rates = this.pricing.filter((p) => p.modelId === modelId).map((p) => p.rateUsd);
    if (rates.length === 0) return null;
    return Math.min(...rates);
  }
}

import { describe, expect, it } from 'vitest';
import type { PricingRule } from '@studio-os/contracts';
import {
  createPricingSnapshot,
  estimateFromRules,
  PLATFORM_MARGIN,
  reconcile,
} from './pricing-engine.js';

const RULE_ID = '11111111-1111-4111-8111-111111111111';

function rule(overrides: Partial<PricingRule> = {}): PricingRule {
  return {
    id: RULE_ID,
    providerId: 'mock',
    modelId: 'mock-image',
    unit: 'image',
    rateUsd: 0.02,
    minimumUsd: 0,
    validFrom: new Date('2020-01-01'),
    validUntil: null,
    ...overrides,
  };
}

describe('createPricingSnapshot', () => {
  it('copies rules and assigns a uuid id', () => {
    const rules = [rule()];
    const snapshot = createPricingSnapshot(rules);
    expect(snapshot.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(snapshot.rules).toEqual(rules);
    expect(snapshot.rules).not.toBe(rules);
  });
});

describe('estimateFromRules', () => {
  it('estimates image cost from matching rules', () => {
    const result = estimateFromRules('mock-image', { images: 3 }, [rule()]);
    expect(result.estimatedCostUsd).toBeCloseTo(0.06);
    expect(result.breakdown).toHaveLength(1);
    expect(result.breakdown[0]?.quantity).toBe(3);
  });

  it('ignores rules for other models', () => {
    const result = estimateFromRules('other-model', { images: 3 }, [rule()]);
    expect(result.estimatedCostUsd).toBe(0);
    expect(result.breakdown).toHaveLength(0);
  });

  it('respects minimumUsd', () => {
    const result = estimateFromRules('mock-image', { images: 1 }, [
      rule({ rateUsd: 0.01, minimumUsd: 0.5 }),
    ]);
    expect(result.estimatedCostUsd).toBe(0.5);
  });
});

describe('reconcile', () => {
  it('applies 1.3x margin to estimated when actual is missing', () => {
    const result = reconcile(10, null);
    expect(result.customerCostUsd).toBe(10 * PLATFORM_MARGIN);
    expect(result.varianceUsd).toBe(0);
  });

  it('applies margin to actual and reports variance', () => {
    const result = reconcile(10, 8);
    expect(result.customerCostUsd).toBe(8 * PLATFORM_MARGIN);
    expect(result.varianceUsd).toBeCloseTo(8 * PLATFORM_MARGIN - 10 * PLATFORM_MARGIN);
  });
});

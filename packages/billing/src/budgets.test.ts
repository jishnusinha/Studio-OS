import { describe, expect, it } from 'vitest';
import { checkBudget } from './budgets.js';

describe('checkBudget', () => {
  it('allows spend under the limit', () => {
    const result = checkBudget({ limitUsd: 100, spentUsd: 20, hardLimit: true }, 10);
    expect(result.allowed).toBe(true);
    expect(result.alerts).toEqual([]);
  });

  it('emits alert thresholds crossed by the proposal', () => {
    const result = checkBudget({ limitUsd: 100, spentUsd: 40 }, 20);
    expect(result.allowed).toBe(true);
    expect(result.alerts).toEqual([50]);
  });

  it('blocks when hard limit would be exceeded', () => {
    const result = checkBudget({ limitUsd: 100, spentUsd: 90, hardLimit: true }, 20);
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/Hard limit/);
    expect(result.alerts).toContain(100);
  });

  it('blocks a single job over maxJobCostUsd', () => {
    const result = checkBudget(
      { limitUsd: 1000, spentUsd: 0, maxJobCostUsd: 5, hardLimit: false },
      10,
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/maxJobCostUsd/);
  });

  it('allows soft overspend when hardLimit is false', () => {
    const result = checkBudget({ limitUsd: 100, spentUsd: 95, hardLimit: false }, 20);
    expect(result.allowed).toBe(true);
    expect(result.alerts).toContain(100);
  });
});

export interface Budget {
  limitUsd: number;
  spentUsd: number;
  hardLimit?: boolean;
  maxJobCostUsd?: number | null;
  requireApprovalAboveUsd?: number | null;
}

export interface BudgetCheckResult {
  allowed: boolean;
  reason?: string;
  alerts: number[];
}

const ALERT_THRESHOLDS = [50, 75, 90, 100] as const;

export function checkBudget(budget: Budget, proposedCost: number): BudgetCheckResult {
  const alerts: number[] = [];
  const projected = budget.spentUsd + proposedCost;

  for (const threshold of ALERT_THRESHOLDS) {
    const thresholdUsd = (budget.limitUsd * threshold) / 100;
    if (budget.spentUsd < thresholdUsd && projected >= thresholdUsd) {
      alerts.push(threshold);
    }
  }

  if (budget.maxJobCostUsd != null && proposedCost > budget.maxJobCostUsd) {
    return {
      allowed: false,
      reason: `Job cost ${proposedCost} exceeds maxJobCostUsd ${budget.maxJobCostUsd}`,
      alerts,
    };
  }

  if (
    budget.requireApprovalAboveUsd != null &&
    proposedCost > budget.requireApprovalAboveUsd
  ) {
    return {
      allowed: false,
      reason: `Job cost ${proposedCost} requires approval above ${budget.requireApprovalAboveUsd}`,
      alerts,
    };
  }

  if (budget.hardLimit && projected > budget.limitUsd) {
    return {
      allowed: false,
      reason: `Hard limit exceeded: spent ${budget.spentUsd} + proposed ${proposedCost} > limit ${budget.limitUsd}`,
      alerts,
    };
  }

  return { allowed: true, alerts };
}

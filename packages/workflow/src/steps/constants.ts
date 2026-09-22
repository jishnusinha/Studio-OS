export const WORKFLOW_STEPS = [
  'validate',
  'resolve_refs',
  'fetch_context',
  'normalize',
  'route',
  'estimate',
  'budget_check',
  'submit',
  'poll',
  'meter',
  'store',
  'lineage',
  'notify',
] as const;

export type WorkflowStepName = (typeof WORKFLOW_STEPS)[number];

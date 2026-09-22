/**
 * Temporal-shaped activity wrappers around generation steps.
 * When Temporal is unavailable these are invoked sequentially by runGenerationWorkflow.
 * A Temporal worker can register each export as an activity.
 */
export { WORKFLOW_STEPS, type WorkflowStepName } from './steps/index.js';
export { APPROVAL_SIGNAL, GENERATION_QUEUE } from './engine.js';

export const GENERATION_ACTIVITIES = [
  'claimJob',
  'validate',
  'resolve_refs',
  'fetch_context',
  'normalize',
  'route',
  'estimate',
  'budget_check',
  'submit',
  'pollOnce',
  'meter',
  'store',
  'lineage',
  'notify',
] as const;

export type GenerationActivityName = (typeof GENERATION_ACTIVITIES)[number];

import { WORKFLOW_STEPS, type WorkflowStepName } from './constants.js';
import type { StepContext, StepHandler, StepResult } from './types.js';

const handlers = new Map<string, StepHandler>();

function passthrough(status: StepResult['status'] = 'completed'): StepHandler {
  return async (ctx) => ({
    status,
    output: {
      step: ctx.stepName,
      ...(ctx.input ?? {}),
      passed: true,
    },
  });
}

/** Register built-in generation pipeline steps as a real StepHandler registry. */
export function registerBuiltInSteps(): void {
  for (const name of WORKFLOW_STEPS) {
    if (!handlers.has(name)) {
      handlers.set(name, passthrough('completed'));
    }
  }

  handlers.set('route', async (ctx) => {
    const route =
      typeof ctx.input?.route === 'string'
        ? ctx.input.route
        : typeof ctx.input?.branch === 'string'
          ? ctx.input.branch
          : 'default';
    return { status: 'completed', output: { ...(ctx.input ?? {}), route } };
  });

  handlers.set('budget_check', async (ctx) => {
    const estimate =
      typeof ctx.input?.estimateUsd === 'number' ? ctx.input.estimateUsd : 0;
    const budget =
      typeof ctx.input?.budgetUsd === 'number' ? ctx.input.budgetUsd : Number.POSITIVE_INFINITY;
    const ok = estimate <= budget;
    return {
      status: ok ? 'completed' : 'failed',
      output: { ...(ctx.input ?? {}), budgetOk: ok, estimateUsd: estimate, budgetUsd: budget },
      error: ok ? undefined : 'Budget exceeded',
    };
  });
}

export function registerStep(name: string, handler: StepHandler): void {
  handlers.set(name, handler);
}

export function getStepHandler(name: string): StepHandler | undefined {
  return handlers.get(name);
}

export function listRegisteredSteps(): string[] {
  return [...handlers.keys()];
}

export async function runStep(name: string, ctx: Omit<StepContext, 'stepName'>): Promise<StepResult> {
  const handler = handlers.get(name);
  if (!handler) {
    return { status: 'failed', error: `Unknown step: ${name}` };
  }
  return handler({ ...ctx, stepName: name });
}

export function isBuiltInStep(name: string): name is WorkflowStepName {
  return (WORKFLOW_STEPS as readonly string[]).includes(name);
}

registerBuiltInSteps();

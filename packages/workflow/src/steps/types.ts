export interface StepContext {
  jobId: string;
  stepName: string;
  input?: Record<string, unknown>;
}

export interface StepResult {
  status: 'completed' | 'failed' | 'skipped';
  output?: Record<string, unknown>;
  error?: string;
}

export type StepHandler = (ctx: StepContext) => Promise<StepResult>;

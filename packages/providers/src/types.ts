import type { Capability, ProviderUsage } from '@studio-os/contracts';

export interface NormalizedRequest<K extends Capability = Capability> {
  capability: K;
  modelId: string;
  providerId: string;
  prompt: string;
  negativePrompt?: string;
  parameters: Record<string, unknown>;
  seed?: number;
  inputUris: string[];
  qualityMode: string;
}

export interface ProviderJob {
  id: string;
  providerJobId: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  outputUris?: string[];
  error?: string;
  usage?: ProviderUsage;
}

export interface ProviderJobStatus {
  status: ProviderJob['status'];
  progress: number;
  outputUris?: string[];
  error?: string;
  usage?: ProviderUsage | null;
}

export interface ProviderAdapter {
  readonly id: string;
  readonly capabilities: Capability[];
  submit(req: NormalizedRequest): Promise<ProviderJob>;
  poll(job: ProviderJob): Promise<ProviderJobStatus>;
  cancel(job: ProviderJob): Promise<void>;
  reportedUsage(job: ProviderJob): Promise<ProviderUsage | null>;
}

import { z } from 'zod';
import { CapabilitySchema, IdSchema, QualityModeSchema } from './common.js';
import { ShotDnaSchema } from './story.js';

export const GenerationIntentSchema = z.object({
  prompt: z.string().optional(),
  negativePrompt: z.string().optional(),
  shotDna: ShotDnaSchema.optional(),
  seed: z.number().int().optional(),
  references: z
    .array(
      z.object({
        assetId: IdSchema,
        role: z.enum([
          'character',
          'location',
          'style',
          'product',
          'start_frame',
          'end_frame',
          'general',
        ]),
        weight: z.number().min(0).max(1).optional(),
      }),
    )
    .default([]),
  parameters: z.record(z.unknown()).default({}),
});
export type GenerationIntent = z.infer<typeof GenerationIntentSchema>;

export const CapabilityConstraintsSchema = z.object({
  qualityMode: QualityModeSchema.default('draft'),
  budgetUsd: z.number().positive().optional(),
  maxLatencyMs: z.number().int().positive().optional(),
  region: z.string().optional(),
  takeCount: z.number().int().min(1).max(8).default(1),
  modelId: z.string().optional(),
  providerId: z.string().optional(),
});
export type CapabilityConstraints = z.infer<typeof CapabilityConstraintsSchema>;

export const CapabilityRequestSchema = z.object({
  capability: CapabilitySchema,
  intent: GenerationIntentSchema,
  constraints: CapabilityConstraintsSchema,
  projectId: IdSchema,
  workspaceId: IdSchema,
  shotId: IdSchema.optional(),
  sceneId: IdSchema.optional(),
  parentAssetIds: z.array(IdSchema).default([]),
});
export type CapabilityRequest = z.infer<typeof CapabilityRequestSchema>;

export const CostEstimateSchema = z.object({
  minUsd: z.number().nonnegative(),
  maxUsd: z.number().nonnegative(),
  currency: z.literal('USD').default('USD'),
  breakdown: z
    .array(
      z.object({
        unit: z.string(),
        quantity: z.number(),
        rate: z.number(),
        amountUsd: z.number(),
      }),
    )
    .default([]),
  modelId: z.string(),
  providerId: z.string(),
  pricingSnapshotId: z.string().uuid().optional(),
  etaSec: z.object({ min: z.number(), max: z.number() }).optional(),
});
export type CostEstimate = z.infer<typeof CostEstimateSchema>;

export const ProviderUsageSchema = z.object({
  inputTokens: z.number().int().nonnegative().default(0),
  cachedInputTokens: z.number().int().nonnegative().default(0),
  outputTokens: z.number().int().nonnegative().default(0),
  inputCharacters: z.number().int().nonnegative().default(0),
  inputAudioSeconds: z.number().nonnegative().default(0),
  outputAudioSeconds: z.number().nonnegative().default(0),
  inputVideoSeconds: z.number().nonnegative().default(0),
  outputVideoSeconds: z.number().nonnegative().default(0),
  images: z.number().int().nonnegative().default(0),
  megapixels: z.number().nonnegative().default(0),
  resolution: z.string().optional(),
  providerCostUsd: z.number().nonnegative().nullable().optional(),
});
export type ProviderUsage = z.infer<typeof ProviderUsageSchema>;

export const JobStatusSchema = z.enum([
  'queued',
  'running',
  'waiting_provider',
  'processing',
  'completed',
  'failed',
  'cancelled',
]);
export type JobStatus = z.infer<typeof JobStatusSchema>;

export const GenerationJobSchema = z.object({
  id: IdSchema,
  projectId: IdSchema,
  capability: CapabilitySchema,
  status: JobStatusSchema,
  progress: z.number().min(0).max(100).default(0),
  estimatedCostUsd: z.number().nullable().optional(),
  actualCostUsd: z.number().nullable().optional(),
  modelId: z.string().nullable().optional(),
  providerId: z.string().nullable().optional(),
  error: z.string().nullable().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type GenerationJob = z.infer<typeof GenerationJobSchema>;

import { z } from 'zod';
import { CapabilitySchema, IdSchema, PricingUnitSchema } from './common.js';

export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_URL: z.string().url().default('http://localhost:3000'),
  API_URL: z.string().url().default('http://localhost:4000'),
  API_PORT: z.coerce.number().int().positive().default(4000),
  SESSION_SECRET: z.string().min(32),
  JWT_SECRET: z.string().min(32),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  /** `s3` = MinIO/S3 cloud (or self-hosted). `local` = filesystem under LOCAL_MEDIA_ROOT. */
  STORAGE_BACKEND: z.enum(['s3', 'local']).default('s3'),
  LOCAL_MEDIA_ROOT: z.string().default('./data/media'),
  S3_ENDPOINT: z.string().url().optional(),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_FORCE_PATH_STYLE: z
    .string()
    .transform((v) => v === 'true')
    .default('true'),
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  GOOGLE_API_KEY: z.string().optional(),
  XAI_API_KEY: z.string().optional(),
  RUNWAY_API_KEY: z.string().optional(),
  ELEVENLABS_API_KEY: z.string().optional(),
  HIGGSFIELD_API_KEY: z.string().optional(),
  FAL_API_KEY: z.string().optional(),
  TEMPORAL_ADDRESS: z.string().optional(),
  TEMPORAL_NAMESPACE: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  /** When set, `@studio-os/observability` exports spans via OTLP/HTTP. */
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional(),
  OTEL_SERVICE_NAME: z.string().optional(),
  GENERATION_WORKER_EXTERNAL: z.string().optional(),
  USE_MOCK_PROVIDERS: z
    .string()
    .transform((v) => v !== 'false')
    .default('true'),
  DEFAULT_QUALITY_MODE: z.enum(['draft', 'production', 'hero', 'manual']).default('draft'),
});
export type Env = z.infer<typeof EnvSchema>;

export function parseEnv(raw: Record<string, string | undefined> = process.env): Env {
  const env = EnvSchema.parse(raw);
  if (env.STORAGE_BACKEND === 's3') {
    if (!env.S3_ENDPOINT || !env.S3_ACCESS_KEY || !env.S3_SECRET_KEY || !env.S3_BUCKET) {
      throw new Error(
        'STORAGE_BACKEND=s3 requires S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY, and S3_BUCKET',
      );
    }
  }
  return env;
}

export const ModelParameterSchema = z.object({
  type: z.enum(['string', 'number', 'integer', 'boolean', 'enum', 'array', 'object']),
  title: z.string().optional(),
  description: z.string().optional(),
  minimum: z.number().optional(),
  maximum: z.number().optional(),
  default: z.unknown().optional(),
  values: z.array(z.union([z.string(), z.number()])).optional(),
  required: z.boolean().optional(),
});
export type ModelParameter = z.infer<typeof ModelParameterSchema>;

export const ModelDefinitionSchema = z.object({
  id: z.string(),
  providerId: z.string(),
  name: z.string(),
  capabilities: z.array(CapabilitySchema),
  parameterSchema: z.record(ModelParameterSchema).default({}),
  published: z.boolean().default(false),
  deprecated: z.boolean().default(false),
});
export type ModelDefinition = z.infer<typeof ModelDefinitionSchema>;

export const PricingRuleSchema = z.object({
  id: IdSchema,
  providerId: z.string(),
  modelId: z.string(),
  unit: PricingUnitSchema,
  rateUsd: z.number().nonnegative(),
  minimumUsd: z.number().nonnegative().default(0),
  resolution: z.string().optional(),
  quality: z.string().optional(),
  validFrom: z.coerce.date(),
  validUntil: z.coerce.date().nullable().optional(),
});
export type PricingRule = z.infer<typeof PricingRuleSchema>;

export const UsageEventSchema = z.object({
  id: IdSchema,
  jobId: IdSchema.optional(),
  workspaceId: IdSchema,
  projectId: IdSchema,
  userId: IdSchema,
  providerId: z.string(),
  modelId: z.string(),
  modelVersion: z.string().optional(),
  inputTokens: z.number().int().nonnegative().default(0),
  cachedInputTokens: z.number().int().nonnegative().default(0),
  outputTokens: z.number().int().nonnegative().default(0),
  images: z.number().int().nonnegative().default(0),
  outputVideoSeconds: z.number().nonnegative().default(0),
  outputAudioSeconds: z.number().nonnegative().default(0),
  resolution: z.string().optional(),
  estimatedCostUsd: z.number().nonnegative(),
  actualProviderCostUsd: z.number().nonnegative().nullable().optional(),
  customerCostUsd: z.number().nonnegative(),
  varianceUsd: z.number().nullable().optional(),
  pricingSnapshotId: IdSchema,
  status: z.enum(['pending', 'completed', 'failed', 'corrected']).default('completed'),
  createdAt: z.coerce.date(),
});
export type UsageEvent = z.infer<typeof UsageEventSchema>;

export const PresignUploadRequestSchema = z.object({
  projectId: IdSchema,
  filename: z.string().min(1),
  contentType: z.string().min(1),
  sizeBytes: z.number().int().positive(),
  assetType: z.enum(['image', 'video', 'audio', 'document', 'script', 'other']),
});
export type PresignUploadRequest = z.infer<typeof PresignUploadRequestSchema>;

export const PresignUploadResponseSchema = z.object({
  assetId: IdSchema,
  uploadUrl: z.string().url(),
  key: z.string(),
  expiresAt: z.coerce.date(),
  /** When true, client PUTs raw bytes (S3). Local mode also uses PUT to the API upload URL. */
  directPut: z.boolean().default(true),
  storageBackend: z.enum(['s3', 'local']).optional(),
});
export type PresignUploadResponse = z.infer<typeof PresignUploadResponseSchema>;

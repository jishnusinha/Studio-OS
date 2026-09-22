import {
  pgTable,
  uuid,
  text,
  timestamp,
  varchar,
  boolean,
  jsonb,
  numeric,
  integer,
  bigint,
  index,
} from 'drizzle-orm/pg-core';
import { models } from './models.js';

export const inferenceEndpoints = pgTable(
  'inference_endpoints',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 200 }).notNull(),
    baseUrl: text('base_url').notNull(),
    kind: varchar('kind', { length: 40 }).notNull().default('openai-compatible'),
    authConfig: jsonb('auth_config').$type<Record<string, unknown>>().notNull().default({}),
    healthy: boolean('healthy').notNull().default(false),
    lastHealthAt: timestamp('last_health_at', { withTimezone: true }),
    enabled: boolean('enabled').notNull().default(true),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('inference_endpoints_enabled_idx').on(t.enabled)],
);

export const gpuNodePools = pgTable('gpu_node_pools', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 200 }).notNull(),
  region: varchar('region', { length: 80 }),
  maxNodes: integer('max_nodes').notNull().default(1),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const gpuNodes = pgTable(
  'gpu_nodes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    poolId: uuid('pool_id')
      .notNull()
      .references(() => gpuNodePools.id, { onDelete: 'cascade' }),
    endpointId: uuid('endpoint_id').references(() => inferenceEndpoints.id, { onDelete: 'set null' }),
    hostname: varchar('hostname', { length: 300 }).notNull(),
    vramGb: numeric('vram_gb', { precision: 10, scale: 2 }),
    status: varchar('status', { length: 40 }).notNull().default('idle'),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('gpu_nodes_pool_idx').on(t.poolId),
    index('gpu_nodes_endpoint_idx').on(t.endpointId),
  ],
);

export const modelWeights = pgTable(
  'model_weights',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 200 }).notNull(),
    modelId: varchar('model_id', { length: 120 }).references(() => models.id, { onDelete: 'set null' }),
    format: varchar('format', { length: 40 }).notNull().default('safetensors'),
    storageUri: text('storage_uri'),
    sizeBytes: bigint('size_bytes', { mode: 'number' }),
    checksum: varchar('checksum', { length: 128 }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('model_weights_model_idx').on(t.modelId)],
);

export const modelWeightDeployments = pgTable(
  'model_weight_deployments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    weightId: uuid('weight_id')
      .notNull()
      .references(() => modelWeights.id, { onDelete: 'cascade' }),
    endpointId: uuid('endpoint_id')
      .notNull()
      .references(() => inferenceEndpoints.id, { onDelete: 'cascade' }),
    nodeId: uuid('node_id').references(() => gpuNodes.id, { onDelete: 'set null' }),
    status: varchar('status', { length: 40 }).notNull().default('pending'),
    deployedAt: timestamp('deployed_at', { withTimezone: true }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('model_weight_deployments_endpoint_idx').on(t.endpointId),
    index('model_weight_deployments_weight_idx').on(t.weightId),
  ],
);

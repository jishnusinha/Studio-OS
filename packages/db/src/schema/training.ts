import {
  pgTable,
  uuid,
  text,
  timestamp,
  varchar,
  jsonb,
  integer,
  numeric,
  real,
  index,
} from 'drizzle-orm/pg-core';
import { projects, users } from './identity.js';
import { assets } from './assets.js';

export const datasets = pgTable('datasets', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 200 }).notNull(),
  type: varchar('type', { length: 60 }).notNull(),
  consent: jsonb('consent').$type<Record<string, unknown>>().notNull().default({}),
  rights: jsonb('rights').$type<Record<string, unknown>>().notNull().default({}),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const datasetItems = pgTable('dataset_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  datasetId: uuid('dataset_id')
    .notNull()
    .references(() => datasets.id, { onDelete: 'cascade' }),
  assetId: uuid('asset_id')
    .notNull()
    .references(() => assets.id, { onDelete: 'cascade' }),
  caption: text('caption'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
});

export const fineTunes = pgTable('fine_tunes', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  datasetId: uuid('dataset_id').references(() => datasets.id, { onDelete: 'set null' }),
  type: varchar('type', { length: 60 }).notNull(),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  status: varchar('status', { length: 40 }).notNull().default('draft'),
  costEstimateUsd: numeric('cost_estimate_usd', { precision: 12, scale: 4 }),
  metrics: jsonb('metrics').$type<Record<string, unknown>>().notNull().default({}),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const modelDeployments = pgTable('model_deployments', {
  id: uuid('id').primaryKey().defaultRandom(),
  fineTuneId: uuid('fine_tune_id').references(() => fineTunes.id, { onDelete: 'set null' }),
  modelId: varchar('model_id', { length: 120 }).notNull(),
  endpoint: text('endpoint'),
  status: varchar('status', { length: 40 }).notNull().default('inactive'),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const trainingRuns = pgTable(
  'training_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    fineTuneId: uuid('fine_tune_id').references(() => fineTunes.id, { onDelete: 'set null' }),
    datasetId: uuid('dataset_id').references(() => datasets.id, { onDelete: 'set null' }),
    name: varchar('name', { length: 200 }).notNull(),
    status: varchar('status', { length: 40 }).notNull().default('queued'),
    config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
    costEstimateUsd: numeric('cost_estimate_usd', { precision: 12, scale: 4 }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => [index('training_runs_project_idx').on(t.projectId)],
);

export const trainingCheckpoints = pgTable(
  'training_checkpoints',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    runId: uuid('run_id')
      .notNull()
      .references(() => trainingRuns.id, { onDelete: 'cascade' }),
    step: integer('step').notNull().default(0),
    label: varchar('label', { length: 200 }),
    storageKey: text('storage_key'),
    metrics: jsonb('metrics').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('training_checkpoints_run_idx').on(t.runId)],
);

export const adapters = pgTable(
  'adapters',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    runId: uuid('run_id').references(() => trainingRuns.id, { onDelete: 'set null' }),
    name: varchar('name', { length: 200 }).notNull(),
    /** LoRA rank */
    rank: integer('rank').notNull().default(16),
    baseModel: varchar('base_model', { length: 200 }).notNull(),
    storageKey: text('storage_key').notNull(),
    status: varchar('status', { length: 40 }).notNull().default('ready'),
    modelHubId: varchar('model_hub_id', { length: 120 }),
    config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('adapters_project_idx').on(t.projectId)],
);

export const trainingMetrics = pgTable(
  'training_metrics',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    runId: uuid('run_id')
      .notNull()
      .references(() => trainingRuns.id, { onDelete: 'cascade' }),
    step: integer('step').notNull().default(0),
    name: varchar('name', { length: 120 }).notNull(),
    value: real('value').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('training_metrics_run_idx').on(t.runId)],
);

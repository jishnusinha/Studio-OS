import {
  pgTable,
  uuid,
  text,
  timestamp,
  varchar,
  boolean,
  jsonb,
  integer,
  real,
  numeric,
  index,
} from 'drizzle-orm/pg-core';
import { projects, users, workspaces } from './identity.js';
import { assets } from './assets.js';
import { shots } from './story.js';

export const generationJobs = pgTable(
  'generation_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    shotId: uuid('shot_id').references(() => shots.id, { onDelete: 'set null' }),
    capability: varchar('capability', { length: 80 }).notNull(),
    status: varchar('status', { length: 40 }).notNull().default('queued'),
    progress: integer('progress').notNull().default(0),
    priority: integer('priority').notNull().default(0),
    providerId: varchar('provider_id', { length: 80 }),
    modelId: varchar('model_id', { length: 120 }),
    modelVersion: varchar('model_version', { length: 80 }),
    providerJobId: varchar('provider_job_id', { length: 200 }),
    request: jsonb('request').$type<Record<string, unknown>>().notNull().default({}),
    estimatedCostUsd: numeric('estimated_cost_usd', { precision: 12, scale: 6 }),
    actualCostUsd: numeric('actual_cost_usd', { precision: 12, scale: 6 }),
    pricingSnapshotId: uuid('pricing_snapshot_id'),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => [
    index('gen_jobs_project_idx').on(t.projectId),
    index('gen_jobs_status_idx').on(t.status),
  ],
);

export const generationJobSteps = pgTable(
  'generation_job_steps',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    jobId: uuid('job_id')
      .notNull()
      .references(() => generationJobs.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 80 }).notNull(),
    status: varchar('status', { length: 40 }).notNull().default('pending'),
    sortOrder: integer('sort_order').notNull(),
    input: jsonb('input').$type<Record<string, unknown>>().default({}),
    output: jsonb('output').$type<Record<string, unknown>>().default({}),
    error: text('error'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => [index('gen_job_steps_job_idx').on(t.jobId)],
);

export const generationInputs = pgTable('generation_inputs', {
  id: uuid('id').primaryKey().defaultRandom(),
  jobId: uuid('job_id')
    .notNull()
    .references(() => generationJobs.id, { onDelete: 'cascade' }),
  assetId: uuid('asset_id').references(() => assets.id, { onDelete: 'set null' }),
  role: varchar('role', { length: 60 }).notNull(),
  weight: real('weight'),
});

export const generationOutputs = pgTable('generation_outputs', {
  id: uuid('id').primaryKey().defaultRandom(),
  jobId: uuid('job_id')
    .notNull()
    .references(() => generationJobs.id, { onDelete: 'cascade' }),
  assetId: uuid('asset_id').references(() => assets.id, { onDelete: 'set null' }),
  takeNumber: integer('take_number').notNull().default(1),
  accepted: boolean('accepted'),
});

export const promptVersions = pgTable('prompt_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  jobId: uuid('job_id')
    .notNull()
    .references(() => generationJobs.id, { onDelete: 'cascade' }),
  userDirection: text('user_direction'),
  compiledPrompt: text('compiled_prompt').notNull(),
  negativePrompt: text('negative_prompt'),
  context: jsonb('context').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

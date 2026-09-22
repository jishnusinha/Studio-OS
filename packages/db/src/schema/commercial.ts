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
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { projects } from './identity.js';
import { brands, products } from './canon.js';
import { assets } from './assets.js';
import { shots } from './story.js';
import { generationJobs } from './jobs.js';

/** Product packshots / hero stills bound to a product */
export const packshots = pgTable(
  'packshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    assetId: uuid('asset_id').references(() => assets.id, { onDelete: 'set null' }),
    url: text('url'),
    label: varchar('label', { length: 200 }),
    sortOrder: integer('sort_order').notNull().default(0),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('packshots_product_idx').on(t.productId),
    index('packshots_project_idx').on(t.projectId),
  ],
);

/** Seeded commercial beat-grammar templates */
export const campaignTemplates = pgTable(
  'campaign_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: varchar('slug', { length: 80 }).notNull(),
    name: varchar('name', { length: 200 }).notNull(),
    description: text('description'),
    beats: jsonb('beats').$type<unknown[]>().notNull().default([]),
    defaultDurationSec: real('default_duration_sec').notNull().default(18),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('campaign_templates_slug_uidx').on(t.slug)],
);

export const campaigns = pgTable(
  'campaigns',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    brandId: uuid('brand_id').references(() => brands.id, { onDelete: 'set null' }),
    productId: uuid('product_id').references(() => products.id, { onDelete: 'set null' }),
    templateId: uuid('template_id').references(() => campaignTemplates.id, {
      onDelete: 'set null',
    }),
    name: varchar('name', { length: 300 }).notNull(),
    status: varchar('status', { length: 40 }).notNull().default('draft'),
    durationSec: real('duration_sec').notNull().default(18),
    data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('campaigns_project_idx').on(t.projectId)],
);

/** Timeline nodes per beat, optionally bound to a shot */
export const campaignBeats = pgTable(
  'campaign_beats',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    beatType: varchar('beat_type', { length: 40 }).notNull(),
    label: varchar('label', { length: 200 }),
    startSec: real('start_sec').notNull().default(0),
    endSec: real('end_sec').notNull().default(2),
    prompt: text('prompt'),
    copy: text('copy'),
    shotId: uuid('shot_id').references(() => shots.id, { onDelete: 'set null' }),
    locked: boolean('locked').notNull().default(false),
    status: varchar('status', { length: 40 }).notNull().default('draft'),
    sortOrder: integer('sort_order').notNull().default(0),
    data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('campaign_beats_campaign_idx').on(t.campaignId),
    index('campaign_beats_project_idx').on(t.projectId),
  ],
);

/** Format × language × duration variant cells */
export const campaignVariants = pgTable(
  'campaign_variants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    format: varchar('format', { length: 20 }).notNull(),
    language: varchar('language', { length: 40 }).notNull(),
    durationSec: real('duration_sec').notNull(),
    status: varchar('status', { length: 40 }).notNull().default('missing'),
    branchId: uuid('branch_id'),
    localization: jsonb('localization').$type<Record<string, unknown>>().notNull().default({}),
    assetId: uuid('asset_id').references(() => assets.id, { onDelete: 'set null' }),
    jobId: uuid('job_id').references(() => generationJobs.id, { onDelete: 'set null' }),
    estimatedCostUsd: numeric('estimated_cost_usd', { precision: 12, scale: 6 }),
    reusedBeatIds: jsonb('reused_beat_ids').$type<string[]>().notNull().default([]),
    regeneratedBeatTypes: jsonb('regenerated_beat_types').$type<string[]>().notNull().default([]),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('campaign_variants_campaign_idx').on(t.campaignId),
    uniqueIndex('campaign_variants_cell_uidx').on(
      t.campaignId,
      t.format,
      t.language,
      t.durationSec,
    ),
  ],
);

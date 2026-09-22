import {
  pgTable,
  uuid,
  text,
  timestamp,
  varchar,
  boolean,
  jsonb,
  numeric,
  real,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { projects } from './identity.js';

export const providers = pgTable('providers', {
  id: varchar('id', { length: 80 }).primaryKey(),
  name: varchar('name', { length: 200 }).notNull(),
  kind: varchar('kind', { length: 40 }).notNull().default('external'),
  enabled: boolean('enabled').notNull().default(true),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const models = pgTable(
  'models',
  {
    id: varchar('id', { length: 120 }).primaryKey(),
    providerId: varchar('provider_id', { length: 80 })
      .notNull()
      .references(() => providers.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 200 }).notNull(),
    description: text('description'),
    published: boolean('published').notNull().default(false),
    deprecated: boolean('deprecated').notNull().default(false),
    parameterSchema: jsonb('parameter_schema').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('models_provider_idx').on(t.providerId)],
);

export const modelVersions = pgTable('model_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  modelId: varchar('model_id', { length: 120 })
    .notNull()
    .references(() => models.id, { onDelete: 'cascade' }),
  version: varchar('version', { length: 80 }).notNull(),
  externalId: varchar('external_id', { length: 200 }),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const capabilities = pgTable('capabilities', {
  id: varchar('id', { length: 80 }).primaryKey(),
  name: varchar('name', { length: 200 }).notNull(),
  modality: varchar('modality', { length: 40 }).notNull(),
});

export const modelCapabilities = pgTable(
  'model_capabilities',
  {
    modelId: varchar('model_id', { length: 120 })
      .notNull()
      .references(() => models.id, { onDelete: 'cascade' }),
    capabilityId: varchar('capability_id', { length: 80 })
      .notNull()
      .references(() => capabilities.id, { onDelete: 'cascade' }),
  },
  (t) => [uniqueIndex('model_cap_unique').on(t.modelId, t.capabilityId)],
);

export const pricingRules = pgTable(
  'pricing_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    providerId: varchar('provider_id', { length: 80 }).notNull(),
    modelId: varchar('model_id', { length: 120 }).notNull(),
    unit: varchar('unit', { length: 40 }).notNull(),
    rateUsd: numeric('rate_usd', { precision: 14, scale: 8 }).notNull(),
    minimumUsd: numeric('minimum_usd', { precision: 12, scale: 4 }).notNull().default('0'),
    resolution: varchar('resolution', { length: 40 }),
    quality: varchar('quality', { length: 40 }),
    validFrom: timestamp('valid_from', { withTimezone: true }).notNull().defaultNow(),
    validUntil: timestamp('valid_until', { withTimezone: true }),
    officialSource: text('official_source'),
    approvalStatus: varchar('approval_status', { length: 40 }).notNull().default('approved'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('pricing_model_idx').on(t.modelId)],
);

export const projectModelPreferences = pgTable(
  'project_model_preferences',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    shotType: varchar('shot_type', { length: 80 }).notNull(),
    modelId: varchar('model_id', { length: 120 }).notNull(),
    weight: real('weight').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('proj_model_pref_unique').on(t.projectId, t.shotType)],
);

import {
  pgTable,
  uuid,
  text,
  timestamp,
  varchar,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';
import { projects } from './identity.js';
import { assets } from './assets.js';

export const contentCredentials = pgTable(
  'content_credentials',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    claimGenerator: varchar('claim_generator', { length: 200 }).notNull().default('StudioOS'),
    title: varchar('title', { length: 500 }),
    status: varchar('status', { length: 40 }).notNull().default('signed'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('content_credentials_asset_idx').on(t.assetId),
    index('content_credentials_project_idx').on(t.projectId),
  ],
);

export const provenanceManifests = pgTable(
  'provenance_manifests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'cascade' }),
    contentCredentialId: uuid('content_credential_id').references(() => contentCredentials.id, {
      onDelete: 'set null',
    }),
    format: varchar('format', { length: 40 }).notNull().default('c2pa-lite'),
    claimJson: jsonb('claim_json').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('provenance_manifests_asset_idx').on(t.assetId)],
);

export const provenanceSignatures = pgTable(
  'provenance_signatures',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    manifestId: uuid('manifest_id')
      .notNull()
      .references(() => provenanceManifests.id, { onDelete: 'cascade' }),
    algorithm: varchar('algorithm', { length: 40 }).notNull().default('RSA-SHA256'),
    publicKeyPem: text('public_key_pem').notNull(),
    signature: text('signature').notNull(),
    signedAt: timestamp('signed_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('provenance_signatures_manifest_idx').on(t.manifestId)],
);

export const provenanceActions = pgTable(
  'provenance_actions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    manifestId: uuid('manifest_id')
      .notNull()
      .references(() => provenanceManifests.id, { onDelete: 'cascade' }),
    action: varchar('action', { length: 80 }).notNull(),
    softwareAgent: varchar('software_agent', { length: 200 }),
    modelId: varchar('model_id', { length: 120 }),
    prompt: text('prompt'),
    parameters: jsonb('parameters').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('provenance_actions_manifest_idx').on(t.manifestId)],
);

export const provenanceIngredients = pgTable(
  'provenance_ingredients',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    manifestId: uuid('manifest_id')
      .notNull()
      .references(() => provenanceManifests.id, { onDelete: 'cascade' }),
    assetId: uuid('asset_id').references(() => assets.id, { onDelete: 'set null' }),
    relationType: varchar('relation_type', { length: 60 }).notNull().default('derivedFrom'),
    title: varchar('title', { length: 500 }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('provenance_ingredients_manifest_idx').on(t.manifestId)],
);

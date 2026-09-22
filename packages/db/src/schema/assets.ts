import {
  pgTable,
  uuid,
  text,
  timestamp,
  varchar,
  boolean,
  jsonb,
  integer,
  bigint,
  index,
} from 'drizzle-orm/pg-core';
import { projects, users } from './identity.js';

export const assets = pgTable(
  'assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 40 }).notNull(),
    name: varchar('name', { length: 500 }).notNull(),
    mimeType: varchar('mime_type', { length: 120 }),
    sizeBytes: bigint('size_bytes', { mode: 'number' }),
    status: varchar('status', { length: 40 }).notNull().default('draft'),
    currentVersion: integer('current_version').notNull().default(1),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    tags: jsonb('tags').$type<string[]>().notNull().default([]),
    rating: integer('rating'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('assets_project_idx').on(t.projectId), index('assets_type_idx').on(t.type)],
);

export const assetVersions = pgTable(
  'asset_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    branchId: uuid('branch_id'),
    parentVersionId: uuid('parent_version_id'),
    storageKey: text('storage_key').notNull(),
    proxyKey: text('proxy_key'),
    thumbnailKey: text('thumbnail_key'),
    waveformKey: text('waveform_key'),
    spriteKey: text('sprite_key'),
    checksum: varchar('checksum', { length: 128 }),
    fingerprint: varchar('fingerprint', { length: 128 }),
    width: integer('width'),
    height: integer('height'),
    durationSec: integer('duration_sec'),
    fps: integer('fps'),
    codec: varchar('codec', { length: 80 }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('asset_versions_asset_idx').on(t.assetId)],
);

/** Lineage & dependency edges — powers lineage viewer and selective invalidation */
export const assetRelations = pgTable(
  'asset_relations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    parentAssetId: uuid('parent_asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'cascade' }),
    childAssetId: uuid('child_asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'cascade' }),
    relationType: varchar('relation_type', { length: 60 }).notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    stale: boolean('stale').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('asset_rel_parent_idx').on(t.parentAssetId),
    index('asset_rel_child_idx').on(t.childAssetId),
  ],
);

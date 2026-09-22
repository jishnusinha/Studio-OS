import {
  pgTable,
  uuid,
  text,
  timestamp,
  varchar,
  jsonb,
  integer,
  customType,
  index,
} from 'drizzle-orm/pg-core';
import { projects, organizations } from './identity.js';
import { assets } from './assets.js';

const vector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return 'vector(384)';
  },
  toDriver(value: number[]): string {
    return `[${value.join(',')}]`;
  },
  fromDriver(value: string): number[] {
    return value
      .replace(/^\[|\]$/g, '')
      .split(',')
      .map(Number);
  },
});

export const knowledgeSources = pgTable(
  'knowledge_sources',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').references(() => organizations.id, {
      onDelete: 'cascade',
    }),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    assetId: uuid('asset_id').references(() => assets.id, { onDelete: 'set null' }),
    title: varchar('title', { length: 500 }).notNull(),
    sourceType: varchar('source_type', { length: 40 }).notNull(),
    scope: varchar('scope', { length: 40 }).notNull().default('project'),
    scopeRefId: uuid('scope_ref_id'),
    status: varchar('status', { length: 40 }).notNull().default('pending'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('knowledge_project_idx').on(t.projectId)],
);

export const documentChunks = pgTable(
  'document_chunks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sourceId: uuid('source_id')
      .notNull()
      .references(() => knowledgeSources.id, { onDelete: 'cascade' }),
    chunkIndex: integer('chunk_index').notNull(),
    content: text('content').notNull(),
    citation: varchar('citation', { length: 500 }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    embedding: vector('embedding'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('chunks_source_idx').on(t.sourceId)],
);

export const assetEmbeddings = pgTable('asset_embeddings', {
  id: uuid('id').primaryKey().defaultRandom(),
  assetId: uuid('asset_id')
    .notNull()
    .references(() => assets.id, { onDelete: 'cascade' }),
  modality: varchar('modality', { length: 40 }).notNull().default('visual'),
  embedding: vector('embedding'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

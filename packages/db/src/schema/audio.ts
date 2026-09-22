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
  index,
} from 'drizzle-orm/pg-core';
import { projects } from './identity.js';
import { characters } from './canon.js';
import { scenes, scriptVersions } from './story.js';
import { assets } from './assets.js';
import { generationJobs } from './jobs.js';

export const dialogueLines = pgTable(
  'dialogue_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    scriptVersionId: uuid('script_version_id').references(() => scriptVersions.id, {
      onDelete: 'set null',
    }),
    sceneId: uuid('scene_id').references(() => scenes.id, { onDelete: 'set null' }),
    characterId: uuid('character_id').references(() => characters.id, { onDelete: 'set null' }),
    speaker: varchar('speaker', { length: 200 }),
    text: text('text').notNull(),
    lineIndex: integer('line_index').notNull().default(0),
    startSec: real('start_sec'),
    endSec: real('end_sec'),
    status: varchar('status', { length: 40 }).notNull().default('draft'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('dialogue_lines_project_idx').on(t.projectId),
    index('dialogue_lines_script_version_idx').on(t.scriptVersionId),
  ],
);

export const adrSessions = pgTable(
  'adr_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    dialogueLineId: uuid('dialogue_line_id').references(() => dialogueLines.id, {
      onDelete: 'set null',
    }),
    sceneId: uuid('scene_id').references(() => scenes.id, { onDelete: 'set null' }),
    characterId: uuid('character_id').references(() => characters.id, { onDelete: 'set null' }),
    name: varchar('name', { length: 300 }).notNull(),
    status: varchar('status', { length: 40 }).notNull().default('open'),
    loopInSec: real('loop_in_sec'),
    loopOutSec: real('loop_out_sec'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('adr_sessions_project_idx').on(t.projectId),
    index('adr_sessions_line_idx').on(t.dialogueLineId),
  ],
);

export const adrTakes = pgTable(
  'adr_takes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => adrSessions.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    number: integer('number').notNull(),
    assetId: uuid('asset_id').references(() => assets.id, { onDelete: 'set null' }),
    rating: integer('rating'),
    selected: boolean('selected').notNull().default(false),
    status: varchar('status', { length: 40 }).notNull().default('draft'),
    notes: text('notes'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('adr_takes_session_idx').on(t.sessionId),
    index('adr_takes_project_idx').on(t.projectId),
  ],
);

export const audioStems = pgTable(
  'audio_stems',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    sourceAssetId: uuid('source_asset_id').references(() => assets.id, { onDelete: 'set null' }),
    assetId: uuid('asset_id').references(() => assets.id, { onDelete: 'set null' }),
    jobId: uuid('job_id').references(() => generationJobs.id, { onDelete: 'set null' }),
    stemType: varchar('stem_type', { length: 40 }).notNull().default('other'),
    label: varchar('label', { length: 200 }),
    sortOrder: integer('sort_order').notNull().default(0),
    status: varchar('status', { length: 40 }).notNull().default('pending'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('audio_stems_project_idx').on(t.projectId),
    index('audio_stems_source_idx').on(t.sourceAssetId),
  ],
);

export const dubbingTracks = pgTable(
  'dubbing_tracks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    dialogueLineId: uuid('dialogue_line_id').references(() => dialogueLines.id, {
      onDelete: 'set null',
    }),
    language: varchar('language', { length: 40 }).notNull(),
    assetId: uuid('asset_id').references(() => assets.id, { onDelete: 'set null' }),
    lipSyncDriftMs: real('lip_sync_drift_ms'),
    status: varchar('status', { length: 40 }).notNull().default('draft'),
    variantLabel: varchar('variant_label', { length: 200 }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('dubbing_tracks_project_idx').on(t.projectId),
    index('dubbing_tracks_language_idx').on(t.projectId, t.language),
  ],
);

export const audioMixBuses = pgTable(
  'audio_mix_buses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 200 }).notNull(),
    busType: varchar('bus_type', { length: 40 }).notNull().default('bus'),
    gainDb: real('gain_db').notNull().default(0),
    pan: real('pan').notNull().default(0),
    muted: boolean('muted').notNull().default(false),
    solo: boolean('solo').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    assetId: uuid('asset_id').references(() => assets.id, { onDelete: 'set null' }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('audio_mix_buses_project_idx').on(t.projectId)],
);

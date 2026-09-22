import {
  pgTable,
  uuid,
  timestamp,
  varchar,
  boolean,
  jsonb,
  integer,
  real,
  index,
} from 'drizzle-orm/pg-core';
import { projects } from './identity.js';
import { assets } from './assets.js';

export const timelines = pgTable('timelines', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 300 }).notNull(),
  fps: integer('fps').notNull().default(24),
  width: integer('width').notNull().default(1920),
  height: integer('height').notNull().default(1080),
  duration: real('duration').notNull().default(0),
  status: varchar('status', { length: 40 }).notNull().default('draft'),
  version: integer('version').notNull().default(1),
  branchId: uuid('branch_id'),
  parentId: uuid('parent_id'),
  data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const tracks = pgTable('tracks', {
  id: uuid('id').primaryKey().defaultRandom(),
  timelineId: uuid('timeline_id')
    .notNull()
    .references(() => timelines.id, { onDelete: 'cascade' }),
  type: varchar('type', { length: 40 }).notNull(),
  name: varchar('name', { length: 200 }).notNull(),
  muted: boolean('muted').notNull().default(false),
  locked: boolean('locked').notNull().default(false),
  solo: boolean('solo').notNull().default(false),
  height: integer('height').notNull().default(60),
  sortOrder: integer('sort_order').notNull().default(0),
});

export const clips = pgTable(
  'clips',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    trackId: uuid('track_id')
      .notNull()
      .references(() => tracks.id, { onDelete: 'cascade' }),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'restrict' }),
    sourceIn: real('source_in').notNull().default(0),
    sourceOut: real('source_out').notNull(),
    timelineStart: real('timeline_start').notNull(),
    transform: jsonb('transform').$type<Record<string, unknown>>().notNull().default({}),
    speed: real('speed').notNull().default(1),
    effects: jsonb('effects').$type<unknown[]>().notNull().default([]),
    keyframes: jsonb('keyframes').$type<unknown[]>().notNull().default([]),
    linkedAudioClipId: uuid('linked_audio_clip_id'),
    muted: boolean('muted').notNull().default(false),
    label: varchar('label', { length: 200 }),
  },
  (t) => [index('clips_track_idx').on(t.trackId)],
);

export const timelineCommands = pgTable('timeline_commands', {
  id: uuid('id').primaryKey().defaultRandom(),
  timelineId: uuid('timeline_id')
    .notNull()
    .references(() => timelines.id, { onDelete: 'cascade' }),
  type: varchar('type', { length: 60 }).notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
  source: varchar('source', { length: 20 }).notNull().default('user'),
  undone: boolean('undone').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

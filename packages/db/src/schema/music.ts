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
import { assets } from './assets.js';
import { timelines } from './timeline.js';
import { generationJobs } from './jobs.js';

export const midiClips = pgTable(
  'midi_clips',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    timelineId: uuid('timeline_id').references(() => timelines.id, { onDelete: 'set null' }),
    name: varchar('name', { length: 300 }).notNull(),
    startSec: real('start_sec').notNull().default(0),
    durationSec: real('duration_sec').notNull().default(4),
    channel: integer('channel').notNull().default(0),
    instrument: varchar('instrument', { length: 120 }),
    jobId: uuid('job_id').references(() => generationJobs.id, { onDelete: 'set null' }),
    status: varchar('status', { length: 40 }).notNull().default('draft'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('midi_clips_project_idx').on(t.projectId),
    index('midi_clips_timeline_idx').on(t.timelineId),
  ],
);

export const midiEvents = pgTable(
  'midi_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clipId: uuid('clip_id')
      .notNull()
      .references(() => midiClips.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    timeSec: real('time_sec').notNull().default(0),
    durationSec: real('duration_sec').notNull().default(0.25),
    note: integer('note').notNull(),
    velocity: integer('velocity').notNull().default(80),
    eventType: varchar('event_type', { length: 40 }).notNull().default('note'),
    channel: integer('channel').notNull().default(0),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('midi_events_clip_idx').on(t.clipId),
    index('midi_events_project_idx').on(t.projectId),
  ],
);

export const scoreCues = pgTable(
  'score_cues',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    timelineId: uuid('timeline_id').references(() => timelines.id, { onDelete: 'set null' }),
    name: varchar('name', { length: 300 }).notNull(),
    timeSec: real('time_sec').notNull().default(0),
    cueType: varchar('cue_type', { length: 60 }).notNull().default('hit'),
    description: text('description'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('score_cues_project_idx').on(t.projectId),
    index('score_cues_timeline_idx').on(t.timelineId),
  ],
);

export const tempoMaps = pgTable(
  'tempo_maps',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    timelineId: uuid('timeline_id').references(() => timelines.id, { onDelete: 'set null' }),
    name: varchar('name', { length: 200 }).notNull().default('Tempo'),
    bpm: real('bpm').notNull().default(120),
    timeSignature: varchar('time_signature', { length: 20 }).notNull().default('4/4'),
    startSec: real('start_sec').notNull().default(0),
    points: jsonb('points').$type<unknown[]>().notNull().default([]),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('tempo_maps_project_idx').on(t.projectId),
    index('tempo_maps_timeline_idx').on(t.timelineId),
  ],
);

export const musicStems = pgTable(
  'music_stems',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 200 }).notNull(),
    assetId: uuid('asset_id').references(() => assets.id, { onDelete: 'set null' }),
    stemType: varchar('stem_type', { length: 40 }).notNull().default('mix'),
    muted: boolean('muted').notNull().default(false),
    solo: boolean('solo').notNull().default(false),
    gainDb: real('gain_db').notNull().default(0),
    pan: real('pan').notNull().default(0),
    sortOrder: integer('sort_order').notNull().default(0),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('music_stems_project_idx').on(t.projectId)],
);

/** Queryable markers promoted from timelines.data markers */
export const scoreMarkers = pgTable(
  'score_markers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    timelineId: uuid('timeline_id')
      .notNull()
      .references(() => timelines.id, { onDelete: 'cascade' }),
    timeSec: real('time_sec').notNull().default(0),
    label: varchar('label', { length: 200 }).notNull(),
    color: varchar('color', { length: 40 }),
    kind: varchar('kind', { length: 40 }).notNull().default('score'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('score_markers_project_idx').on(t.projectId),
    index('score_markers_timeline_idx').on(t.timelineId),
  ],
);

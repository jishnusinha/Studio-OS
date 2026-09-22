import {
  pgTable,
  uuid,
  text,
  timestamp,
  varchar,
  jsonb,
  integer,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { projects } from './identity.js';
import { assets } from './assets.js';
import { timelines } from './timeline.js';

export type ColorWheel = { r: number; g: number; b: number };
export type ColorCurves = Record<string, Array<[number, number]>>;
export type ColorQualifiers = {
  hue: [number, number];
  saturation: [number, number];
  luminance: [number, number];
};
export type ColorNodeGraph = {
  nodes: Array<Record<string, unknown>>;
  edges: Array<Record<string, unknown>>;
};

export const colorGrades = pgTable(
  'color_grades',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 300 }).notNull(),
    nodeGraph: jsonb('node_graph')
      .$type<ColorNodeGraph>()
      .notNull()
      .default({ nodes: [], edges: [] }),
    version: integer('version').notNull().default(1),
    lookId: uuid('look_id'),
    lutId: uuid('lut_id'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('color_grades_project_idx').on(t.projectId)],
);

export const luts = pgTable(
  'luts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 300 }).notNull(),
    assetId: uuid('asset_id').references(() => assets.id, { onDelete: 'set null' }),
    storageKey: text('storage_key'),
    format: varchar('format', { length: 40 }).notNull().default('cube'),
    size: integer('size'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('luts_project_idx').on(t.projectId)],
);

export const looks = pgTable(
  'looks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 300 }).notNull(),
    gradeId: uuid('grade_id').references(() => colorGrades.id, { onDelete: 'set null' }),
    lutId: uuid('lut_id').references(() => luts.id, { onDelete: 'set null' }),
    parameters: jsonb('parameters').$type<Record<string, unknown>>().notNull().default({}),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('looks_project_idx').on(t.projectId)],
);

export const clipColorState = pgTable(
  'clip_color_state',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    timelineId: uuid('timeline_id').references(() => timelines.id, { onDelete: 'cascade' }),
    clipId: uuid('clip_id').notNull(),
    gradeId: uuid('grade_id').references(() => colorGrades.id, { onDelete: 'set null' }),
    lift: jsonb('lift').$type<ColorWheel>().notNull().default({ r: 0, g: 0, b: 0 }),
    gamma: jsonb('gamma').$type<ColorWheel>().notNull().default({ r: 1, g: 1, b: 1 }),
    gain: jsonb('gain').$type<ColorWheel>().notNull().default({ r: 1, g: 1, b: 1 }),
    curves: jsonb('curves')
      .$type<ColorCurves>()
      .notNull()
      .default({ master: [[0, 0], [1, 1]] }),
    qualifiers: jsonb('qualifiers')
      .$type<ColorQualifiers>()
      .notNull()
      .default({ hue: [0, 360], saturation: [0, 1], luminance: [0, 1] }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('clip_color_state_project_idx').on(t.projectId),
    index('clip_color_state_clip_idx').on(t.projectId, t.clipId),
    uniqueIndex('clip_color_state_timeline_clip_uidx')
      .on(t.timelineId, t.clipId)
      .where(sql`${t.timelineId} IS NOT NULL`),
  ],
);

export const colorScopes = pgTable(
  'color_scopes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    timelineId: uuid('timeline_id').references(() => timelines.id, { onDelete: 'set null' }),
    clipId: uuid('clip_id'),
    assetId: uuid('asset_id').references(() => assets.id, { onDelete: 'set null' }),
    scopeType: varchar('scope_type', { length: 40 }).notNull().default('waveform'),
    data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
    sampledAt: timestamp('sampled_at', { withTimezone: true }).notNull().defaultNow(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('color_scopes_project_idx').on(t.projectId),
    index('color_scopes_clip_idx').on(t.clipId),
  ],
);

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
import { timelines } from './timeline.js';
import { generationJobs } from './jobs.js';

export type RotoPoint = { x: number; y: number; handleIn?: { x: number; y: number }; handleOut?: { x: number; y: number } };
export type RotoKeyframe = { frame: number; points: RotoPoint[] };

export const multicamGroups = pgTable(
  'multicam_groups',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    timelineId: uuid('timeline_id').references(() => timelines.id, { onDelete: 'set null' }),
    name: varchar('name', { length: 300 }).notNull(),
    activeAngleId: uuid('active_angle_id'),
    syncOffsetSec: real('sync_offset_sec').notNull().default(0),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('multicam_groups_project_idx').on(t.projectId),
    index('multicam_groups_timeline_idx').on(t.timelineId),
  ],
);

export const multicamAngles = pgTable(
  'multicam_angles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    groupId: uuid('group_id')
      .notNull()
      .references(() => multicamGroups.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 200 }).notNull(),
    label: varchar('label', { length: 40 }).notNull().default('A'),
    assetId: uuid('asset_id').references(() => assets.id, { onDelete: 'set null' }),
    sortOrder: integer('sort_order').notNull().default(0),
    offsetSec: real('offset_sec').notNull().default(0),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('multicam_angles_group_idx').on(t.groupId),
    index('multicam_angles_project_idx').on(t.projectId),
  ],
);

export const masks = pgTable(
  'masks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    timelineId: uuid('timeline_id').references(() => timelines.id, { onDelete: 'set null' }),
    clipId: uuid('clip_id'),
    name: varchar('name', { length: 300 }).notNull(),
    shapeType: varchar('shape_type', { length: 40 }).notNull().default('bezier'),
    parameters: jsonb('parameters').$type<Record<string, unknown>>().notNull().default({}),
    feather: real('feather').notNull().default(0),
    inverted: boolean('inverted').notNull().default(false),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('masks_project_idx').on(t.projectId),
    index('masks_clip_idx').on(t.clipId),
  ],
);

export const rotoShapes = pgTable(
  'roto_shapes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    maskId: uuid('mask_id').references(() => masks.id, { onDelete: 'set null' }),
    clipId: uuid('clip_id'),
    name: varchar('name', { length: 300 }).notNull(),
    points: jsonb('points').$type<RotoPoint[]>().notNull().default([]),
    frameIn: integer('frame_in').notNull().default(0),
    frameOut: integer('frame_out').notNull().default(24),
    keyframes: jsonb('keyframes').$type<RotoKeyframe[]>().notNull().default([]),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('roto_shapes_project_idx').on(t.projectId),
    index('roto_shapes_mask_idx').on(t.maskId),
  ],
);

export const mattes = pgTable(
  'mattes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    rotoShapeId: uuid('roto_shape_id').references(() => rotoShapes.id, { onDelete: 'set null' }),
    maskId: uuid('mask_id').references(() => masks.id, { onDelete: 'set null' }),
    assetId: uuid('asset_id').references(() => assets.id, { onDelete: 'set null' }),
    jobId: uuid('job_id').references(() => generationJobs.id, { onDelete: 'set null' }),
    status: varchar('status', { length: 40 }).notNull().default('pending'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('mattes_project_idx').on(t.projectId),
    index('mattes_roto_idx').on(t.rotoShapeId),
  ],
);

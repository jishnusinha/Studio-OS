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
import { characters, locations } from './canon.js';

export const scripts = pgTable('scripts', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 300 }).notNull(),
  format: varchar('format', { length: 40 }).notNull().default('fountain'),
  status: varchar('status', { length: 40 }).notNull().default('draft'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const scriptVersions = pgTable('script_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  scriptId: uuid('script_id')
    .notNull()
    .references(() => scripts.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  branchId: uuid('branch_id'),
  parentId: uuid('parent_id'),
  content: text('content').notNull(),
  storyBible: jsonb('story_bible').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sequences = pgTable(
  'sequences',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    scriptId: uuid('script_id').references(() => scripts.id, { onDelete: 'set null' }),
    number: integer('number').notNull(),
    title: varchar('title', { length: 300 }).notNull(),
    description: text('description'),
    status: varchar('status', { length: 40 }).notNull().default('draft'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('sequences_project_idx').on(t.projectId)],
);

export const scenes = pgTable(
  'scenes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    sequenceId: uuid('sequence_id').references(() => sequences.id, { onDelete: 'set null' }),
    number: integer('number').notNull(),
    slug: varchar('slug', { length: 20 }).notNull(),
    heading: varchar('heading', { length: 500 }).notNull(),
    synopsis: text('synopsis'),
    emotion: text('emotion'),
    durationTargetSec: real('duration_target_sec'),
    locationId: uuid('location_id').references(() => locations.id, { onDelete: 'set null' }),
    status: varchar('status', { length: 40 }).notNull().default('draft'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('scenes_project_idx').on(t.projectId)],
);

export const shots = pgTable(
  'shots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    sceneId: uuid('scene_id')
      .notNull()
      .references(() => scenes.id, { onDelete: 'cascade' }),
    code: varchar('code', { length: 40 }).notNull(),
    description: text('description'),
    shotDna: jsonb('shot_dna').$type<Record<string, unknown>>().notNull().default({}),
    characterId: uuid('character_id').references(() => characters.id, { onDelete: 'set null' }),
    durationSec: real('duration_sec').default(5),
    status: varchar('status', { length: 40 }).notNull().default('draft'),
    sortOrder: integer('sort_order').notNull().default(0),
    locked: boolean('locked').notNull().default(false),
    version: integer('version').notNull().default(1),
    branchId: uuid('branch_id'),
    parentId: uuid('parent_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('shots_scene_idx').on(t.sceneId), index('shots_project_idx').on(t.projectId)],
);

export const takes = pgTable(
  'takes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    shotId: uuid('shot_id')
      .notNull()
      .references(() => shots.id, { onDelete: 'cascade' }),
    number: integer('number').notNull(),
    assetId: uuid('asset_id'),
    rating: integer('rating'),
    selected: boolean('selected').notNull().default(false),
    status: varchar('status', { length: 40 }).notNull().default('draft'),
    modelId: varchar('model_id', { length: 120 }),
    providerId: varchar('provider_id', { length: 80 }),
    costUsd: real('cost_usd'),
    seed: integer('seed'),
    promptCompiled: text('prompt_compiled'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('takes_shot_idx').on(t.shotId)],
);

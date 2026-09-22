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
import { projects, users } from './identity.js';
import { shots, takes } from './story.js';
import { generationJobs } from './jobs.js';

export const continuityChecks = pgTable(
  'continuity_checks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    scopeType: varchar('scope_type', { length: 40 }).notNull().default('project'),
    scopeId: uuid('scope_id'),
    status: varchar('status', { length: 40 }).notNull().default('pending'),
    triggeredBy: uuid('triggered_by').references(() => users.id, { onDelete: 'set null' }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('continuity_checks_project_idx').on(t.projectId),
    index('continuity_checks_scope_idx').on(t.scopeType, t.scopeId),
  ],
);

export const continuityScores = pgTable(
  'continuity_scores',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    checkId: uuid('check_id')
      .notNull()
      .references(() => continuityChecks.id, { onDelete: 'cascade' }),
    shotId: uuid('shot_id')
      .notNull()
      .references(() => shots.id, { onDelete: 'cascade' }),
    takeId: uuid('take_id').references(() => takes.id, { onDelete: 'set null' }),
    dimension: varchar('dimension', { length: 40 }).notNull(),
    score: real('score').notNull().default(1),
    details: jsonb('details').$type<Record<string, unknown>>().notNull().default({}),
    citations: jsonb('citations').$type<unknown[]>().notNull().default([]),
  },
  (t) => [
    index('continuity_scores_check_idx').on(t.checkId),
    index('continuity_scores_shot_idx').on(t.shotId),
    index('continuity_scores_dimension_idx').on(t.dimension),
  ],
);

export const shotComparisons = pgTable(
  'shot_comparisons',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    checkId: uuid('check_id')
      .notNull()
      .references(() => continuityChecks.id, { onDelete: 'cascade' }),
    leftShotId: uuid('left_shot_id')
      .notNull()
      .references(() => shots.id, { onDelete: 'cascade' }),
    rightShotId: uuid('right_shot_id')
      .notNull()
      .references(() => shots.id, { onDelete: 'cascade' }),
    leftTakeId: uuid('left_take_id').references(() => takes.id, { onDelete: 'set null' }),
    rightTakeId: uuid('right_take_id').references(() => takes.id, { onDelete: 'set null' }),
    embeddingDistance: real('embedding_distance'),
    diff: jsonb('diff').$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => [index('shot_comparisons_check_idx').on(t.checkId)],
);

export const continuityConstraints = pgTable(
  'continuity_constraints',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    entityType: varchar('entity_type', { length: 40 }).notNull(),
    entityId: uuid('entity_id'),
    key: varchar('key', { length: 200 }).notNull(),
    value: text('value').notNull(),
    priority: integer('priority').notNull().default(0),
    autoEnforce: boolean('auto_enforce').notNull().default(true),
    sceneRange: varchar('scene_range', { length: 100 }),
    locked: boolean('locked').notNull().default(true),
  },
  (t) => [
    index('continuity_constraints_project_idx').on(t.projectId),
    index('continuity_constraints_entity_idx').on(t.entityType, t.entityId),
  ],
);

export const continuityRepairs = pgTable(
  'continuity_repairs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    checkId: uuid('check_id')
      .notNull()
      .references(() => continuityChecks.id, { onDelete: 'cascade' }),
    scoreId: uuid('score_id')
      .notNull()
      .references(() => continuityScores.id, { onDelete: 'cascade' }),
    shotId: uuid('shot_id')
      .notNull()
      .references(() => shots.id, { onDelete: 'cascade' }),
    strategy: varchar('strategy', { length: 80 }).notNull().default('regenerate'),
    jobId: uuid('job_id').references(() => generationJobs.id, { onDelete: 'set null' }),
    status: varchar('status', { length: 40 }).notNull().default('queued'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('continuity_repairs_check_idx').on(t.checkId),
    index('continuity_repairs_score_idx').on(t.scoreId),
  ],
);

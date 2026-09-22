import {
  pgTable,
  uuid,
  text,
  timestamp,
  varchar,
  jsonb,
  integer,
  boolean,
  real,
  index,
} from 'drizzle-orm/pg-core';
import { projects, users } from './identity.js';

export const workflowDefinitions = pgTable(
  'workflow_definitions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 200 }).notNull(),
    description: text('description'),
    version: integer('version').notNull().default(1),
    status: varchar('status', { length: 40 }).notNull().default('draft'),
    graph: jsonb('graph').$type<Record<string, unknown>>().notNull().default({}),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('workflow_definitions_project_idx').on(t.projectId)],
);

export const workflowNodes = pgTable(
  'workflow_nodes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    definitionId: uuid('definition_id')
      .notNull()
      .references(() => workflowDefinitions.id, { onDelete: 'cascade' }),
    key: varchar('key', { length: 120 }).notNull(),
    type: varchar('type', { length: 80 }).notNull(),
    label: varchar('label', { length: 200 }),
    config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
    positionX: real('position_x').notNull().default(0),
    positionY: real('position_y').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('workflow_nodes_definition_idx').on(t.definitionId)],
);

export const workflowEdges = pgTable(
  'workflow_edges',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    definitionId: uuid('definition_id')
      .notNull()
      .references(() => workflowDefinitions.id, { onDelete: 'cascade' }),
    sourceKey: varchar('source_key', { length: 120 }).notNull(),
    targetKey: varchar('target_key', { length: 120 }).notNull(),
    condition: jsonb('condition').$type<Record<string, unknown>>(),
    label: varchar('label', { length: 120 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('workflow_edges_definition_idx').on(t.definitionId)],
);

export const workflowRuns = pgTable(
  'workflow_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    definitionId: uuid('definition_id')
      .notNull()
      .references(() => workflowDefinitions.id, { onDelete: 'cascade' }),
    status: varchar('status', { length: 40 }).notNull().default('pending'),
    input: jsonb('input').$type<Record<string, unknown>>().notNull().default({}),
    output: jsonb('output').$type<Record<string, unknown>>().notNull().default({}),
    error: text('error'),
    startedBy: uuid('started_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => [
    index('workflow_runs_project_idx').on(t.projectId),
    index('workflow_runs_definition_idx').on(t.definitionId),
  ],
);

export const workflowRunSteps = pgTable(
  'workflow_run_steps',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    runId: uuid('run_id')
      .notNull()
      .references(() => workflowRuns.id, { onDelete: 'cascade' }),
    nodeKey: varchar('node_key', { length: 120 }).notNull(),
    stepType: varchar('step_type', { length: 80 }).notNull(),
    status: varchar('status', { length: 40 }).notNull().default('pending'),
    attempt: integer('attempt').notNull().default(1),
    fanOut: boolean('fan_out').notNull().default(false),
    input: jsonb('input').$type<Record<string, unknown>>().notNull().default({}),
    output: jsonb('output').$type<Record<string, unknown>>().notNull().default({}),
    error: text('error'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => [index('workflow_run_steps_run_idx').on(t.runId)],
);

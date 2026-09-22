import {
  pgTable,
  uuid,
  text,
  timestamp,
  varchar,
  boolean,
  jsonb,
  integer,
  index,
} from 'drizzle-orm/pg-core';
import { projects } from './identity.js';

export const brands = pgTable('brands', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 200 }).notNull(),
  dna: jsonb('dna').$type<Record<string, unknown>>().notNull().default({}),
  status: varchar('status', { length: 40 }).notNull().default('draft'),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const characters = pgTable(
  'characters',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 200 }).notNull(),
    bio: text('bio'),
    identity: jsonb('identity').$type<Record<string, unknown>>().notNull().default({}),
    body: jsonb('body').$type<Record<string, unknown>>().notNull().default({}),
    wardrobe: jsonb('wardrobe').$type<Record<string, unknown>>().notNull().default({}),
    voiceProfile: jsonb('voice_profile').$type<Record<string, unknown>>().notNull().default({}),
    acting: jsonb('acting').$type<Record<string, unknown>>().notNull().default({}),
    rights: jsonb('rights').$type<Record<string, unknown>>().notNull().default({}),
    status: varchar('status', { length: 40 }).notNull().default('draft'),
    version: integer('version').notNull().default(1),
    locked: boolean('locked').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('characters_project_idx').on(t.projectId)],
);

export const voices = pgTable('voices', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  characterId: uuid('character_id').references(() => characters.id, { onDelete: 'set null' }),
  name: varchar('name', { length: 200 }).notNull(),
  profile: jsonb('profile').$type<Record<string, unknown>>().notNull().default({}),
  consent: jsonb('consent').$type<Record<string, unknown>>().notNull().default({}),
  status: varchar('status', { length: 40 }).notNull().default('draft'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const locations = pgTable('locations', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 200 }).notNull(),
  description: text('description'),
  dna: jsonb('dna').$type<Record<string, unknown>>().notNull().default({}),
  status: varchar('status', { length: 40 }).notNull().default('draft'),
  locked: boolean('locked').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const products = pgTable('products', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  brandId: uuid('brand_id').references(() => brands.id, { onDelete: 'set null' }),
  name: varchar('name', { length: 200 }).notNull(),
  properties: jsonb('properties').$type<Record<string, unknown>>().notNull().default({}),
  status: varchar('status', { length: 40 }).notNull().default('draft'),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const styles = pgTable('styles', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 200 }).notNull(),
  dna: jsonb('dna').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const worlds = pgTable('worlds', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 200 }).notNull(),
  rules: jsonb('rules').$type<string[]>().notNull().default([]),
  dna: jsonb('dna').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const lockedFacts = pgTable(
  'locked_facts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    entityType: varchar('entity_type', { length: 40 }).notNull(),
    entityId: uuid('entity_id'),
    key: varchar('key', { length: 200 }).notNull(),
    value: text('value').notNull(),
    locked: boolean('locked').notNull().default(true),
    sceneRange: varchar('scene_range', { length: 100 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('locked_facts_project_idx').on(t.projectId)],
);

import {
  pgTable,
  uuid,
  text,
  timestamp,
  varchar,
  boolean,
  jsonb,
  real,
  integer,
  index,
  customType,
} from 'drizzle-orm/pg-core';
import { projects, users } from './identity.js';
import { assets } from './assets.js';

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return 'bytea';
  },
});

export const comments = pgTable(
  'comments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    parentId: uuid('parent_id'),
    targetType: varchar('target_type', { length: 60 }).notNull(),
    targetId: uuid('target_id').notNull(),
    body: text('body').notNull(),
    timecode: real('timecode'),
    resolved: boolean('resolved').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('comments_target_idx').on(t.targetType, t.targetId),
    index('comments_parent_idx').on(t.parentId),
  ],
);

export const annotations = pgTable('annotations', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  targetType: varchar('target_type', { length: 60 }).notNull(),
  targetId: uuid('target_id').notNull(),
  data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const approvals = pgTable('approvals', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  targetType: varchar('target_type', { length: 60 }).notNull(),
  targetId: uuid('target_id').notNull(),
  status: varchar('status', { length: 40 }).notNull().default('needs_review'),
  requestedBy: uuid('requested_by').references(() => users.id, { onDelete: 'set null' }),
  reviewedBy: uuid('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const deliverables = pgTable('deliverables', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 300 }).notNull(),
  preset: varchar('preset', { length: 80 }).notNull(),
  assetId: uuid('asset_id').references(() => assets.id, { onDelete: 'set null' }),
  status: varchar('status', { length: 40 }).notNull().default('pending'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const collabRooms = pgTable(
  'collab_rooms',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 200 }).notNull(),
    kind: varchar('kind', { length: 60 }).notNull().default('timeline'),
    targetType: varchar('target_type', { length: 60 }),
    targetId: uuid('target_id'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('collab_rooms_project_idx').on(t.projectId)],
);

export const presenceSessions = pgTable(
  'presence_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    roomId: uuid('room_id').references(() => collabRooms.id, { onDelete: 'set null' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    displayName: varchar('display_name', { length: 200 }),
    color: varchar('color', { length: 40 }),
    cursorX: real('cursor_x'),
    cursorY: real('cursor_y'),
    selection: jsonb('selection').$type<Record<string, unknown>>().notNull().default({}),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('presence_sessions_project_idx').on(t.projectId),
    index('presence_sessions_room_idx').on(t.roomId),
  ],
);

export const crdtDocuments = pgTable(
  'crdt_documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    roomId: uuid('room_id').references(() => collabRooms.id, { onDelete: 'cascade' }),
    docKey: varchar('doc_key', { length: 200 }).notNull(),
    /** Yjs state as bytea; also mirrored as base64 text for simple clients */
    state: bytea('state'),
    stateText: text('state_text'),
    version: integer('version').notNull().default(0),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('crdt_documents_project_idx').on(t.projectId),
    index('crdt_documents_key_idx').on(t.projectId, t.docKey),
  ],
);

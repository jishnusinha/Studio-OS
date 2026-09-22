import {
  pgTable,
  uuid,
  text,
  timestamp,
  varchar,
  boolean,
  jsonb,
  numeric,
  index,
} from 'drizzle-orm/pg-core';
import { projects, users, workspaces, organizations } from './identity.js';
import { generationJobs } from './jobs.js';

/** Immutable usage events — never UPDATE, only append corrections */
export const usageEvents = pgTable(
  'usage_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    jobId: uuid('job_id').references(() => generationJobs.id, { onDelete: 'set null' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    providerId: varchar('provider_id', { length: 80 }).notNull(),
    modelId: varchar('model_id', { length: 120 }).notNull(),
    modelVersion: varchar('model_version', { length: 80 }),
    inputTokens: numeric('input_tokens', { precision: 14, scale: 0 }).notNull().default('0'),
    cachedInputTokens: numeric('cached_input_tokens', { precision: 14, scale: 0 })
      .notNull()
      .default('0'),
    outputTokens: numeric('output_tokens', { precision: 14, scale: 0 }).notNull().default('0'),
    images: numeric('images', { precision: 10, scale: 0 }).notNull().default('0'),
    outputVideoSeconds: numeric('output_video_seconds', { precision: 12, scale: 4 })
      .notNull()
      .default('0'),
    outputAudioSeconds: numeric('output_audio_seconds', { precision: 12, scale: 4 })
      .notNull()
      .default('0'),
    gpuSeconds: numeric('gpu_seconds', { precision: 14, scale: 4 }).notNull().default('0'),
    vramGbSeconds: numeric('vram_gb_seconds', { precision: 14, scale: 4 }).notNull().default('0'),
    resolution: varchar('resolution', { length: 40 }),
    estimatedCostUsd: numeric('estimated_cost_usd', { precision: 12, scale: 6 }).notNull(),
    actualProviderCostUsd: numeric('actual_provider_cost_usd', { precision: 12, scale: 6 }),
    customerCostUsd: numeric('customer_cost_usd', { precision: 12, scale: 6 }).notNull(),
    varianceUsd: numeric('variance_usd', { precision: 12, scale: 6 }),
    pricingSnapshotId: uuid('pricing_snapshot_id').notNull(),
    status: varchar('status', { length: 40 }).notNull().default('completed'),
    correctsEventId: uuid('corrects_event_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('usage_project_idx').on(t.projectId),
    index('usage_workspace_idx').on(t.workspaceId),
    index('usage_created_idx').on(t.createdAt),
  ],
);

export const pricingSnapshots = pgTable('pricing_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  rules: jsonb('rules').$type<unknown[]>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const ledgerTransactions = pgTable(
  'ledger_transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 40 }).notNull(),
    amountUsd: numeric('amount_usd', { precision: 12, scale: 6 }).notNull(),
    balanceAfterUsd: numeric('balance_after_usd', { precision: 12, scale: 6 }).notNull(),
    usageEventId: uuid('usage_event_id').references(() => usageEvents.id, { onDelete: 'set null' }),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('ledger_workspace_idx').on(t.workspaceId)],
);

export const budgets = pgTable('budgets', {
  id: uuid('id').primaryKey().defaultRandom(),
  scopeType: varchar('scope_type', { length: 40 }).notNull(),
  scopeId: uuid('scope_id').notNull(),
  limitUsd: numeric('limit_usd', { precision: 12, scale: 4 }).notNull(),
  spentUsd: numeric('spent_usd', { precision: 12, scale: 4 }).notNull().default('0'),
  period: varchar('period', { length: 40 }).notNull().default('monthly'),
  alert50: boolean('alert_50').notNull().default(false),
  alert75: boolean('alert_75').notNull().default(false),
  alert90: boolean('alert_90').notNull().default(false),
  alert100: boolean('alert_100').notNull().default(false),
  hardLimit: boolean('hard_limit').notNull().default(false),
  maxJobCostUsd: numeric('max_job_cost_usd', { precision: 12, scale: 4 }),
  maxDailyUserSpendUsd: numeric('max_daily_user_spend_usd', { precision: 12, scale: 4 }),
  requireApprovalAboveUsd: numeric('require_approval_above_usd', { precision: 12, scale: 4 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const invoices = pgTable('invoices', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
  periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),
  amountUsd: numeric('amount_usd', { precision: 12, scale: 4 }).notNull(),
  status: varchar('status', { length: 40 }).notNull().default('draft'),
  stripeInvoiceId: varchar('stripe_invoice_id', { length: 200 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const creditBalances = pgTable('credit_balances', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' })
    .unique(),
  balanceUsd: numeric('balance_usd', { precision: 12, scale: 4 }).notNull().default('100'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const billingPlans = pgTable('billing_plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: varchar('code', { length: 80 }).notNull().unique(),
  name: varchar('name', { length: 200 }).notNull(),
  description: text('description'),
  amountUsd: numeric('amount_usd', { precision: 12, scale: 4 }).notNull().default('0'),
  interval: varchar('interval', { length: 40 }).notNull().default('month'),
  stripePriceId: varchar('stripe_price_id', { length: 200 }),
  active: boolean('active').notNull().default(true),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const stripeCustomers = pgTable(
  'stripe_customers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    stripeCustomerId: varchar('stripe_customer_id', { length: 200 }).notNull().unique(),
    email: varchar('email', { length: 320 }),
    name: varchar('name', { length: 200 }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('stripe_customers_org_idx').on(t.organizationId)],
);

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    billingPlanId: uuid('billing_plan_id').references(() => billingPlans.id, { onDelete: 'set null' }),
    stripeSubscriptionId: varchar('stripe_subscription_id', { length: 200 }),
    status: varchar('status', { length: 40 }).notNull().default('active'),
    currentPeriodStart: timestamp('current_period_start', { withTimezone: true }),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('subscriptions_org_idx').on(t.organizationId)],
);

export const paymentMethods = pgTable(
  'payment_methods',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    stripePaymentMethodId: varchar('stripe_payment_method_id', { length: 200 }),
    type: varchar('type', { length: 40 }).notNull().default('card'),
    last4: varchar('last4', { length: 4 }),
    brand: varchar('brand', { length: 40 }),
    isDefault: boolean('is_default').notNull().default(false),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('payment_methods_org_idx').on(t.organizationId)],
);

export const invoiceLineItems = pgTable(
  'invoice_line_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => invoices.id, { onDelete: 'cascade' }),
    usageEventId: uuid('usage_event_id').references(() => usageEvents.id, { onDelete: 'set null' }),
    description: text('description').notNull(),
    amountUsd: numeric('amount_usd', { precision: 12, scale: 6 }).notNull(),
    quantity: numeric('quantity', { precision: 12, scale: 4 }).notNull().default('1'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('invoice_line_items_invoice_idx').on(t.invoiceId)],
);

export const stripeEvents = pgTable(
  'stripe_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    stripeEventId: varchar('stripe_event_id', { length: 200 }).notNull().unique(),
    type: varchar('type', { length: 120 }).notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('stripe_events_type_idx').on(t.type)],
);

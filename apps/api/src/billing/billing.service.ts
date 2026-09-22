import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import {
  checkBudget,
  costPerAccepted,
  createBillingProvider,
  rollupBy,
  wasteRatio,
  type BillingProvider,
} from '@studio-os/billing';
import type { Env } from '@studio-os/contracts';
import {
  billingPlans,
  budgets,
  creditBalances,
  generationJobs,
  generationOutputs,
  invoiceLineItems,
  invoices,
  organizations,
  projects,
  stripeCustomers,
  stripeEvents,
  subscriptions,
  usageEvents,
  workspaces,
  type Database,
} from '@studio-os/db';
import { and, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { ENV } from '../config/env.js';
import { DB } from '../db/db.tokens.js';

const SubscribeSchema = z.object({
  planCode: z.string().min(1),
  email: z.string().email().optional(),
});

const InvoiceFromUsageSchema = z.object({
  periodStart: z.coerce.date().optional(),
  periodEnd: z.coerce.date().optional(),
});

@Injectable()
export class BillingService implements OnModuleInit {
  private provider!: BillingProvider;

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
  ) {}

  onModuleInit() {
    this.provider = createBillingProvider(this.env.STRIPE_SECRET_KEY);
  }

  getProviderKind() {
    return this.provider.kind;
  }

  async projectUsage(projectId: string) {
    const events = await this.db
      .select()
      .from(usageEvents)
      .where(eq(usageEvents.projectId, projectId));

    const totalCustomer = events.reduce((s, e) => s + Number(e.customerCostUsd), 0);
    const totalEstimated = events.reduce((s, e) => s + Number(e.estimatedCostUsd), 0);
    const totalProvider = events.reduce((s, e) => s + Number(e.actualProviderCostUsd ?? 0), 0);
    const totalVariance = events.reduce((s, e) => s + Number(e.varianceUsd ?? 0), 0);

    const [project] = await this.db
      .select({ spentUsd: projects.spentUsd })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    const [budget] = await this.db
      .select()
      .from(budgets)
      .where(and(eq(budgets.scopeType, 'project'), eq(budgets.scopeId, projectId)))
      .limit(1);

    return {
      projectId,
      eventCount: events.length,
      totalCustomerCostUsd: totalCustomer,
      totalEstimatedCostUsd: totalEstimated,
      totalProviderCostUsd: totalProvider,
      varianceUsd: totalVariance,
      projectSpentUsd: Number(project?.spentUsd ?? 0),
      budget: budget
        ? {
            limitUsd: Number(budget.limitUsd),
            spentUsd: Number(budget.spentUsd),
            hardLimit: budget.hardLimit,
            alerts: {
              alert50: budget.alert50,
              alert75: budget.alert75,
              alert90: budget.alert90,
              alert100: budget.alert100,
            },
            requireApprovalAboveUsd: budget.requireApprovalAboveUsd
              ? Number(budget.requireApprovalAboveUsd)
              : null,
          }
        : null,
      events: events.map((e) => ({
        id: e.id,
        modelId: e.modelId,
        providerId: e.providerId,
        customerCostUsd: Number(e.customerCostUsd),
        estimatedCostUsd: Number(e.estimatedCostUsd),
        actualProviderCostUsd: Number(e.actualProviderCostUsd ?? 0),
        varianceUsd: Number(e.varianceUsd ?? 0),
        gpuSeconds: Number(e.gpuSeconds ?? 0),
        vramGbSeconds: Number(e.vramGbSeconds ?? 0),
        status: e.status,
        createdAt: e.createdAt,
      })),
    };
  }

  async workspaceBilling(workspaceId: string) {
    const [workspace] = await this.db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);
    if (!workspace) throw new NotFoundException('Workspace not found');

    const [credits] = await this.db
      .select()
      .from(creditBalances)
      .where(eq(creditBalances.workspaceId, workspaceId))
      .limit(1);

    const [budget] = await this.db
      .select()
      .from(budgets)
      .where(and(eq(budgets.scopeType, 'workspace'), eq(budgets.scopeId, workspaceId)))
      .limit(1);

    const events = await this.db
      .select({
        customerCostUsd: usageEvents.customerCostUsd,
        varianceUsd: usageEvents.varianceUsd,
      })
      .from(usageEvents)
      .where(eq(usageEvents.workspaceId, workspaceId));

    const spent = events.reduce((s, e) => s + Number(e.customerCostUsd), 0);
    const variance = events.reduce((s, e) => s + Number(e.varianceUsd ?? 0), 0);

    const orgBilling = await this.orgBillingSummary(workspace.organizationId);

    return {
      workspace,
      creditBalanceUsd: credits ? Number(credits.balanceUsd) : 0,
      spentUsd: spent,
      varianceUsd: variance,
      billingProvider: this.provider.kind,
      organization: orgBilling,
      budget: budget
        ? {
            limitUsd: Number(budget.limitUsd),
            spentUsd: Number(budget.spentUsd),
            hardLimit: budget.hardLimit,
            alerts: {
              alert50: budget.alert50,
              alert75: budget.alert75,
              alert90: budget.alert90,
              alert100: budget.alert100,
            },
          }
        : null,
    };
  }

  async listPlans() {
    const plans = await this.db
      .select()
      .from(billingPlans)
      .where(eq(billingPlans.active, true));
    return {
      provider: this.provider.kind,
      plans: plans.map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        description: p.description,
        amountUsd: Number(p.amountUsd),
        interval: p.interval,
        stripePriceId: p.stripePriceId,
      })),
    };
  }

  async orgBillingSummary(organizationId: string) {
    const [org] = await this.db
      .select()
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);
    if (!org) throw new NotFoundException('Organization not found');

    const [customer] = await this.db
      .select()
      .from(stripeCustomers)
      .where(eq(stripeCustomers.organizationId, organizationId))
      .limit(1);

    const subs = await this.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.organizationId, organizationId));

    return {
      organizationId,
      name: org.name,
      stripeCustomerId: org.stripeCustomerId ?? customer?.stripeCustomerId ?? null,
      subscription: subs[0]
        ? {
            id: subs[0].id,
            status: subs[0].status,
            billingPlanId: subs[0].billingPlanId,
            stripeSubscriptionId: subs[0].stripeSubscriptionId,
            currentPeriodEnd: subs[0].currentPeriodEnd,
          }
        : null,
      provider: this.provider.kind,
    };
  }

  async subscribeOrganization(organizationId: string, body: unknown) {
    const input = SubscribeSchema.parse(body);
    const [org] = await this.db
      .select()
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);
    if (!org) throw new NotFoundException('Organization not found');

    const [plan] = await this.db
      .select()
      .from(billingPlans)
      .where(and(eq(billingPlans.code, input.planCode), eq(billingPlans.active, true)))
      .limit(1);
    if (!plan) throw new NotFoundException(`Unknown plan: ${input.planCode}`);

    let [customer] = await this.db
      .select()
      .from(stripeCustomers)
      .where(eq(stripeCustomers.organizationId, organizationId))
      .limit(1);

    if (!customer) {
      const created = await this.provider.createCustomer({
        organizationId,
        email: input.email ?? `${org.slug}@studioos.local`,
        name: org.name,
      });
      const [row] = await this.db
        .insert(stripeCustomers)
        .values({
          organizationId,
          stripeCustomerId: created.customerId,
          email: input.email ?? `${org.slug}@studioos.local`,
          name: org.name,
        })
        .returning();
      customer = row!;
      await this.db
        .update(organizations)
        .set({ stripeCustomerId: created.customerId })
        .where(eq(organizations.id, organizationId));
    }

    const subResult = await this.provider.createSubscription({
      customerId: customer.stripeCustomerId,
      planCode: plan.code,
      stripePriceId: plan.stripePriceId,
    });

    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    const [sub] = await this.db
      .insert(subscriptions)
      .values({
        organizationId,
        billingPlanId: plan.id,
        stripeSubscriptionId: subResult.subscriptionId,
        status: subResult.status,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
      })
      .returning();

    return {
      subscription: sub,
      plan: { code: plan.code, name: plan.name, amountUsd: Number(plan.amountUsd) },
      provider: this.provider.kind,
    };
  }

  async subscribeWorkspace(workspaceId: string, body: unknown) {
    const [workspace] = await this.db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);
    if (!workspace) throw new NotFoundException('Workspace not found');
    return this.subscribeOrganization(workspace.organizationId, body);
  }

  async createInvoiceFromUsage(organizationId: string, body: unknown) {
    const input = InvoiceFromUsageSchema.parse(body ?? {});
    const periodEnd = input.periodEnd ?? new Date();
    const periodStart =
      input.periodStart ?? new Date(periodEnd.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [org] = await this.db
      .select()
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);
    if (!org) throw new NotFoundException('Organization not found');

    const [customer] = await this.db
      .select()
      .from(stripeCustomers)
      .where(eq(stripeCustomers.organizationId, organizationId))
      .limit(1);
    if (!customer) {
      throw new BadRequestException('No billing customer — subscribe to a plan first');
    }

    const orgWorkspaces = await this.db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.organizationId, organizationId));
    const wsIds = orgWorkspaces.map((w) => w.id);
    if (wsIds.length === 0) {
      throw new BadRequestException('Organization has no workspaces');
    }

    const events = await this.db
      .select()
      .from(usageEvents)
      .where(
        and(
          inArray(usageEvents.workspaceId, wsIds),
          gte(usageEvents.createdAt, periodStart),
          lte(usageEvents.createdAt, periodEnd),
        ),
      );

    const lineItems = events.map((e) => ({
      description: `${e.providerId}/${e.modelId} usage`,
      amountUsd: Number(e.customerCostUsd),
      quantity: 1,
      usageEventId: e.id,
    }));

    if (lineItems.length === 0) {
      lineItems.push({
        description: 'No usage in period (placeholder)',
        amountUsd: 0,
        quantity: 1,
        usageEventId: undefined as unknown as string,
      });
    }

    const providerInvoice = await this.provider.createInvoiceFromUsage({
      customerId: customer.stripeCustomerId,
      organizationId,
      periodStart,
      periodEnd,
      lineItems: lineItems.map(({ usageEventId: _u, ...rest }) => rest),
    });

    const amountUsd = lineItems.reduce((s, li) => s + li.amountUsd * li.quantity, 0);
    const [invoice] = await this.db
      .insert(invoices)
      .values({
        organizationId,
        periodStart,
        periodEnd,
        amountUsd: String(Math.round(amountUsd * 1e4) / 1e4),
        status: providerInvoice.status,
        stripeInvoiceId: providerInvoice.invoiceId,
      })
      .returning();

    for (const li of lineItems) {
      if (!li.usageEventId && li.amountUsd === 0) continue;
      await this.db.insert(invoiceLineItems).values({
        invoiceId: invoice!.id,
        usageEventId: li.usageEventId || null,
        description: li.description,
        amountUsd: String(li.amountUsd),
        quantity: String(li.quantity),
      });
    }

    return {
      invoice,
      lineItemCount: lineItems.filter((li) => li.usageEventId).length,
      provider: this.provider.kind,
    };
  }

  async handleStripeWebhook(payload: unknown, signature?: string) {
    const result = await this.provider.handleWebhook(payload, signature);

    const [existing] = await this.db
      .select()
      .from(stripeEvents)
      .where(eq(stripeEvents.stripeEventId, result.eventId))
      .limit(1);

    if (existing) {
      return { ok: true, duplicate: true, eventId: result.eventId, type: result.type };
    }

    await this.db.insert(stripeEvents).values({
      stripeEventId: result.eventId,
      type: result.type,
      payload: result.payload,
      processedAt: new Date(),
    });

    return { ok: true, duplicate: false, eventId: result.eventId, type: result.type };
  }

  async costAnalytics(projectId: string) {
    const [project] = await this.db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    if (!project) throw new NotFoundException('Project not found');

    const events = await this.db
      .select()
      .from(usageEvents)
      .where(eq(usageEvents.projectId, projectId));

    const mapped = events.map((e) => ({
      projectId: e.projectId,
      modelId: e.modelId,
      userId: e.userId,
      estimatedCostUsd: Number(e.estimatedCostUsd),
      customerCostUsd: Number(e.customerCostUsd),
      varianceUsd: Number(e.varianceUsd ?? 0),
    }));

    const projectJobs = await this.db
      .select({ id: generationJobs.id })
      .from(generationJobs)
      .where(eq(generationJobs.projectId, projectId));
    const jobIds = projectJobs.map((j) => j.id);

    let acceptedCount = 0;
    if (jobIds.length > 0) {
      const accepted = await this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(generationOutputs)
        .where(
          and(eq(generationOutputs.accepted, true), inArray(generationOutputs.jobId, jobIds)),
        );
      acceptedCount = accepted[0]?.count ?? 0;
    }

    const totalGens = events.length;
    const totalVariance = mapped.reduce((s, e) => s + e.varianceUsd, 0);

    return {
      projectId,
      byModel: rollupBy(mapped, 'modelId'),
      byUser: rollupBy(mapped, 'userId'),
      costPerAccepted: costPerAccepted(mapped, acceptedCount || 1),
      wasteRatio: wasteRatio(totalGens, acceptedCount),
      acceptedCount,
      totalGenerations: totalGens,
      totalCustomerCostUsd: mapped.reduce((s, e) => s + e.customerCostUsd, 0),
      varianceUsd: totalVariance,
      projectSpentUsd: Number(project.spentUsd),
    };
  }

  /** Preview whether a proposed spend would trip alerts / hard limit. */
  async previewSpend(projectId: string, proposedUsd: number) {
    const [budget] = await this.db
      .select()
      .from(budgets)
      .where(and(eq(budgets.scopeType, 'project'), eq(budgets.scopeId, projectId)))
      .limit(1);
    if (!budget) return { allowed: true, alerts: [] as number[] };
    return checkBudget(
      {
        limitUsd: Number(budget.limitUsd),
        spentUsd: Number(budget.spentUsd),
        hardLimit: budget.hardLimit,
        maxJobCostUsd: budget.maxJobCostUsd ? Number(budget.maxJobCostUsd) : undefined,
        requireApprovalAboveUsd: budget.requireApprovalAboveUsd
          ? Number(budget.requireApprovalAboveUsd)
          : undefined,
      },
      proposedUsd,
    );
  }
}

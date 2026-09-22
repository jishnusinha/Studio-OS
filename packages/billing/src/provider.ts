import { randomUUID } from 'node:crypto';

export interface CreateCustomerInput {
  organizationId: string;
  email: string;
  name: string;
  metadata?: Record<string, unknown>;
}

export interface CreateCustomerResult {
  customerId: string;
  provider: 'mock' | 'stripe';
}

export interface CreateSubscriptionInput {
  customerId: string;
  planCode: string;
  stripePriceId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface CreateSubscriptionResult {
  subscriptionId: string;
  status: string;
  provider: 'mock' | 'stripe';
}

export interface InvoiceLineItemInput {
  description: string;
  amountUsd: number;
  quantity?: number;
  usageEventId?: string;
}

export interface CreateInvoiceInput {
  customerId: string;
  organizationId: string;
  periodStart: Date;
  periodEnd: Date;
  lineItems: InvoiceLineItemInput[];
}

export interface CreateInvoiceResult {
  invoiceId: string;
  amountUsd: number;
  status: string;
  provider: 'mock' | 'stripe';
}

export interface WebhookResult {
  eventId: string;
  type: string;
  duplicate: boolean;
  payload: Record<string, unknown>;
}

export interface BillingProvider {
  readonly kind: 'mock' | 'stripe';
  createCustomer(input: CreateCustomerInput): Promise<CreateCustomerResult>;
  createSubscription(input: CreateSubscriptionInput): Promise<CreateSubscriptionResult>;
  createInvoiceFromUsage(input: CreateInvoiceInput): Promise<CreateInvoiceResult>;
  /** Parse/acknowledge a webhook payload. Idempotency is enforced by the caller via stripe_events. */
  handleWebhook(payload: unknown, signature?: string): Promise<WebhookResult>;
}

export class MockBillingProvider implements BillingProvider {
  readonly kind = 'mock' as const;

  async createCustomer(input: CreateCustomerInput): Promise<CreateCustomerResult> {
    return {
      customerId: `cus_mock_${input.organizationId.slice(0, 8)}_${randomUUID().slice(0, 8)}`,
      provider: 'mock',
    };
  }

  async createSubscription(_input: CreateSubscriptionInput): Promise<CreateSubscriptionResult> {
    return {
      subscriptionId: `sub_mock_${randomUUID().slice(0, 12)}`,
      status: 'active',
      provider: 'mock',
    };
  }

  async createInvoiceFromUsage(input: CreateInvoiceInput): Promise<CreateInvoiceResult> {
    const amountUsd = input.lineItems.reduce(
      (sum, li) => sum + li.amountUsd * (li.quantity ?? 1),
      0,
    );
    return {
      invoiceId: `in_mock_${randomUUID().slice(0, 12)}`,
      amountUsd: Math.round(amountUsd * 1e6) / 1e6,
      status: 'draft',
      provider: 'mock',
    };
  }

  async handleWebhook(payload: unknown, _signature?: string): Promise<WebhookResult> {
    const body = (payload ?? {}) as Record<string, unknown>;
    const eventId =
      typeof body.id === 'string' ? body.id : `evt_mock_${randomUUID().slice(0, 12)}`;
    const type = typeof body.type === 'string' ? body.type : 'mock.test';
    return { eventId, type, duplicate: false, payload: body };
  }
}

async function stripeRequest(
  secretKey: string,
  method: string,
  path: string,
  form?: Record<string, string>,
): Promise<Record<string, unknown>> {
  const body = form ? new URLSearchParams(form).toString() : undefined;
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const err = json.error as { message?: string } | undefined;
    throw new Error(err?.message ?? `Stripe ${method} ${path} failed (${res.status})`);
  }
  return json;
}

export class StripeBillingProvider implements BillingProvider {
  readonly kind = 'stripe' as const;

  constructor(private readonly secretKey: string) {}

  async createCustomer(input: CreateCustomerInput): Promise<CreateCustomerResult> {
    const json = await stripeRequest(this.secretKey, 'POST', '/customers', {
      email: input.email,
      name: input.name,
      'metadata[organizationId]': input.organizationId,
    });
    return { customerId: String(json.id), provider: 'stripe' };
  }

  async createSubscription(input: CreateSubscriptionInput): Promise<CreateSubscriptionResult> {
    if (!input.stripePriceId) {
      // Test-mode stub when no Stripe Price is configured yet
      return {
        subscriptionId: `sub_test_${randomUUID().slice(0, 12)}`,
        status: 'active',
        provider: 'stripe',
      };
    }
    const json = await stripeRequest(this.secretKey, 'POST', '/subscriptions', {
      customer: input.customerId,
      'items[0][price]': input.stripePriceId,
    });
    return {
      subscriptionId: String(json.id),
      status: String(json.status ?? 'active'),
      provider: 'stripe',
    };
  }

  async createInvoiceFromUsage(input: CreateInvoiceInput): Promise<CreateInvoiceResult> {
    const amountUsd = input.lineItems.reduce(
      (sum, li) => sum + li.amountUsd * (li.quantity ?? 1),
      0,
    );

    // Create invoice items then finalize an invoice in test mode
    for (const li of input.lineItems) {
      const amountCents = Math.round(li.amountUsd * (li.quantity ?? 1) * 100);
      if (amountCents <= 0) continue;
      await stripeRequest(this.secretKey, 'POST', '/invoiceitems', {
        customer: input.customerId,
        amount: String(amountCents),
        currency: 'usd',
        description: li.description.slice(0, 500),
      });
    }

    const invoice = await stripeRequest(this.secretKey, 'POST', '/invoices', {
      customer: input.customerId,
      auto_advance: 'false',
    });

    return {
      invoiceId: String(invoice.id),
      amountUsd: Math.round(amountUsd * 1e6) / 1e6,
      status: String(invoice.status ?? 'draft'),
      provider: 'stripe',
    };
  }

  async handleWebhook(payload: unknown, _signature?: string): Promise<WebhookResult> {
    // Signature verification can be added when STRIPE_WEBHOOK_SECRET is wired.
    const body = (payload ?? {}) as Record<string, unknown>;
    if (typeof body.id !== 'string' || typeof body.type !== 'string') {
      throw new Error('Invalid Stripe webhook payload');
    }
    return {
      eventId: body.id,
      type: body.type,
      duplicate: false,
      payload: body,
    };
  }
}

/** Mock by default; Stripe activates when STRIPE_SECRET_KEY is set. */
export function createBillingProvider(secretKey?: string | null): BillingProvider {
  if (secretKey && secretKey.trim().length > 0) {
    return new StripeBillingProvider(secretKey.trim());
  }
  return new MockBillingProvider();
}

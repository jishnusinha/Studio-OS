-- Phase E4: Stripe test-mode billing

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS stripe_customer_id varchar(200);
CREATE INDEX IF NOT EXISTS organizations_stripe_customer_idx ON organizations(stripe_customer_id);

CREATE TABLE IF NOT EXISTS billing_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(80) NOT NULL UNIQUE,
  name varchar(200) NOT NULL,
  description text,
  amount_usd numeric(12, 4) NOT NULL DEFAULT 0,
  interval varchar(40) NOT NULL DEFAULT 'month',
  stripe_price_id varchar(200),
  active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stripe_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  stripe_customer_id varchar(200) NOT NULL UNIQUE,
  email varchar(320),
  name varchar(200),
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS stripe_customers_org_idx ON stripe_customers(organization_id);

CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  billing_plan_id uuid REFERENCES billing_plans(id) ON DELETE SET NULL,
  stripe_subscription_id varchar(200),
  status varchar(40) NOT NULL DEFAULT 'active',
  current_period_start timestamptz,
  current_period_end timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS subscriptions_org_idx ON subscriptions(organization_id);

CREATE TABLE IF NOT EXISTS payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  stripe_payment_method_id varchar(200),
  type varchar(40) NOT NULL DEFAULT 'card',
  last4 varchar(4),
  brand varchar(40),
  is_default boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payment_methods_org_idx ON payment_methods(organization_id);

CREATE TABLE IF NOT EXISTS invoice_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  usage_event_id uuid REFERENCES usage_events(id) ON DELETE SET NULL,
  description text NOT NULL,
  amount_usd numeric(12, 6) NOT NULL,
  quantity numeric(12, 4) NOT NULL DEFAULT 1,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS invoice_line_items_invoice_idx ON invoice_line_items(invoice_id);

CREATE TABLE IF NOT EXISTS stripe_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id varchar(200) NOT NULL UNIQUE,
  type varchar(120) NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS stripe_events_type_idx ON stripe_events(type);

INSERT INTO billing_plans (code, name, description, amount_usd, interval, active)
VALUES
  ('starter', 'Starter', 'Usage-based starter plan for teams', 49, 'month', true),
  ('pro', 'Pro', 'Higher limits and priority routing', 199, 'month', true),
  ('enterprise', 'Enterprise', 'Custom limits and dedicated support', 999, 'month', true)
ON CONFLICT (code) DO NOTHING;

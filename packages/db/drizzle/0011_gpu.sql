-- Phase E6: Self-hosted GPU inference

ALTER TABLE usage_events ADD COLUMN IF NOT EXISTS gpu_seconds numeric(14, 4) NOT NULL DEFAULT 0;
ALTER TABLE usage_events ADD COLUMN IF NOT EXISTS vram_gb_seconds numeric(14, 4) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS inference_endpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(200) NOT NULL,
  base_url text NOT NULL,
  kind varchar(40) NOT NULL DEFAULT 'openai-compatible',
  auth_config jsonb NOT NULL DEFAULT '{}',
  healthy boolean NOT NULL DEFAULT false,
  last_health_at timestamptz,
  enabled boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inference_endpoints_enabled_idx ON inference_endpoints(enabled);

CREATE TABLE IF NOT EXISTS gpu_node_pools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(200) NOT NULL,
  region varchar(80),
  max_nodes integer NOT NULL DEFAULT 1,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gpu_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id uuid NOT NULL REFERENCES gpu_node_pools(id) ON DELETE CASCADE,
  endpoint_id uuid REFERENCES inference_endpoints(id) ON DELETE SET NULL,
  hostname varchar(300) NOT NULL,
  vram_gb numeric(10, 2),
  status varchar(40) NOT NULL DEFAULT 'idle',
  last_seen_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gpu_nodes_pool_idx ON gpu_nodes(pool_id);
CREATE INDEX IF NOT EXISTS gpu_nodes_endpoint_idx ON gpu_nodes(endpoint_id);

CREATE TABLE IF NOT EXISTS model_weights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(200) NOT NULL,
  model_id varchar(120) REFERENCES models(id) ON DELETE SET NULL,
  format varchar(40) NOT NULL DEFAULT 'safetensors',
  storage_uri text,
  size_bytes bigint,
  checksum varchar(128),
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS model_weights_model_idx ON model_weights(model_id);

CREATE TABLE IF NOT EXISTS model_weight_deployments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  weight_id uuid NOT NULL REFERENCES model_weights(id) ON DELETE CASCADE,
  endpoint_id uuid NOT NULL REFERENCES inference_endpoints(id) ON DELETE CASCADE,
  node_id uuid REFERENCES gpu_nodes(id) ON DELETE SET NULL,
  status varchar(40) NOT NULL DEFAULT 'pending',
  deployed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS model_weight_deployments_endpoint_idx ON model_weight_deployments(endpoint_id);
CREATE INDEX IF NOT EXISTS model_weight_deployments_weight_idx ON model_weight_deployments(weight_id);

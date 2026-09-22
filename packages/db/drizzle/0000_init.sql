CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email varchar(320) NOT NULL UNIQUE,
  password_hash text NOT NULL,
  name varchar(200) NOT NULL,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(200) NOT NULL,
  slug varchar(80) NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role varchar(40) NOT NULL DEFAULT 'member',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS org_member_unique ON organization_members(organization_id, user_id);

CREATE TABLE IF NOT EXISTS workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name varchar(200) NOT NULL,
  slug varchar(80) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS workspace_slug_unique ON workspaces(organization_id, slug);

CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name varchar(200) NOT NULL,
  slug varchar(80) NOT NULL,
  type varchar(40) NOT NULL DEFAULT 'cinema',
  description text,
  budget_usd numeric(12,4),
  spent_usd numeric(12,4) NOT NULL DEFAULT 0,
  status varchar(40) NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS project_slug_unique ON projects(workspace_id, slug);

CREATE TABLE IF NOT EXISTS project_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role varchar(40) NOT NULL DEFAULT 'viewer',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS project_member_unique ON project_members(project_id, user_id);

CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name varchar(200) NOT NULL,
  dna jsonb NOT NULL DEFAULT '{}',
  status varchar(40) NOT NULL DEFAULT 'draft',
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS characters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name varchar(200) NOT NULL,
  bio text,
  identity jsonb NOT NULL DEFAULT '{}',
  body jsonb NOT NULL DEFAULT '{}',
  wardrobe jsonb NOT NULL DEFAULT '{}',
  voice_profile jsonb NOT NULL DEFAULT '{}',
  acting jsonb NOT NULL DEFAULT '{}',
  rights jsonb NOT NULL DEFAULT '{}',
  status varchar(40) NOT NULL DEFAULT 'draft',
  version integer NOT NULL DEFAULT 1,
  locked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS characters_project_idx ON characters(project_id);

CREATE TABLE IF NOT EXISTS voices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  character_id uuid REFERENCES characters(id) ON DELETE SET NULL,
  name varchar(200) NOT NULL,
  profile jsonb NOT NULL DEFAULT '{}',
  consent jsonb NOT NULL DEFAULT '{}',
  status varchar(40) NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name varchar(200) NOT NULL,
  description text,
  dna jsonb NOT NULL DEFAULT '{}',
  status varchar(40) NOT NULL DEFAULT 'draft',
  locked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  brand_id uuid REFERENCES brands(id) ON DELETE SET NULL,
  name varchar(200) NOT NULL,
  properties jsonb NOT NULL DEFAULT '{}',
  status varchar(40) NOT NULL DEFAULT 'draft',
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS styles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name varchar(200) NOT NULL,
  dna jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS worlds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name varchar(200) NOT NULL,
  rules jsonb NOT NULL DEFAULT '[]',
  dna jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS locked_facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  entity_type varchar(40) NOT NULL,
  entity_id uuid,
  key varchar(200) NOT NULL,
  value text NOT NULL,
  locked boolean NOT NULL DEFAULT true,
  scene_range varchar(100),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS locked_facts_project_idx ON locked_facts(project_id);

CREATE TABLE IF NOT EXISTS scripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title varchar(300) NOT NULL,
  format varchar(40) NOT NULL DEFAULT 'fountain',
  status varchar(40) NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS script_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  script_id uuid NOT NULL REFERENCES scripts(id) ON DELETE CASCADE,
  version integer NOT NULL,
  branch_id uuid,
  parent_id uuid,
  content text NOT NULL,
  story_bible jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  script_id uuid REFERENCES scripts(id) ON DELETE SET NULL,
  number integer NOT NULL,
  title varchar(300) NOT NULL,
  description text,
  status varchar(40) NOT NULL DEFAULT 'draft',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sequences_project_idx ON sequences(project_id);

CREATE TABLE IF NOT EXISTS scenes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  sequence_id uuid REFERENCES sequences(id) ON DELETE SET NULL,
  number integer NOT NULL,
  slug varchar(20) NOT NULL,
  heading varchar(500) NOT NULL,
  synopsis text,
  emotion text,
  duration_target_sec real,
  location_id uuid REFERENCES locations(id) ON DELETE SET NULL,
  status varchar(40) NOT NULL DEFAULT 'draft',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS scenes_project_idx ON scenes(project_id);

CREATE TABLE IF NOT EXISTS shots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  scene_id uuid NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
  code varchar(40) NOT NULL,
  description text,
  shot_dna jsonb NOT NULL DEFAULT '{}',
  character_id uuid REFERENCES characters(id) ON DELETE SET NULL,
  duration_sec real DEFAULT 5,
  status varchar(40) NOT NULL DEFAULT 'draft',
  sort_order integer NOT NULL DEFAULT 0,
  locked boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  branch_id uuid,
  parent_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS shots_scene_idx ON shots(scene_id);
CREATE INDEX IF NOT EXISTS shots_project_idx ON shots(project_id);

CREATE TABLE IF NOT EXISTS takes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shot_id uuid NOT NULL REFERENCES shots(id) ON DELETE CASCADE,
  number integer NOT NULL,
  asset_id uuid,
  rating integer,
  selected boolean NOT NULL DEFAULT false,
  status varchar(40) NOT NULL DEFAULT 'draft',
  model_id varchar(120),
  provider_id varchar(80),
  cost_usd real,
  seed integer,
  prompt_compiled text,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS takes_shot_idx ON takes(shot_id);

CREATE TABLE IF NOT EXISTS assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type varchar(40) NOT NULL,
  name varchar(500) NOT NULL,
  mime_type varchar(120),
  size_bytes bigint,
  status varchar(40) NOT NULL DEFAULT 'draft',
  current_version integer NOT NULL DEFAULT 1,
  metadata jsonb NOT NULL DEFAULT '{}',
  tags jsonb NOT NULL DEFAULT '[]',
  rating integer,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS assets_project_idx ON assets(project_id);
CREATE INDEX IF NOT EXISTS assets_type_idx ON assets(type);

CREATE TABLE IF NOT EXISTS asset_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  version integer NOT NULL,
  branch_id uuid,
  parent_version_id uuid,
  storage_key text NOT NULL,
  proxy_key text,
  thumbnail_key text,
  waveform_key text,
  sprite_key text,
  checksum varchar(128),
  fingerprint varchar(128),
  width integer,
  height integer,
  duration_sec integer,
  fps integer,
  codec varchar(80),
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS asset_versions_asset_idx ON asset_versions(asset_id);

CREATE TABLE IF NOT EXISTS asset_relations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  child_asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  relation_type varchar(60) NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  stale boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS asset_rel_parent_idx ON asset_relations(parent_asset_id);
CREATE INDEX IF NOT EXISTS asset_rel_child_idx ON asset_relations(child_asset_id);

CREATE TABLE IF NOT EXISTS timelines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name varchar(300) NOT NULL,
  fps integer NOT NULL DEFAULT 24,
  width integer NOT NULL DEFAULT 1920,
  height integer NOT NULL DEFAULT 1080,
  duration real NOT NULL DEFAULT 0,
  status varchar(40) NOT NULL DEFAULT 'draft',
  version integer NOT NULL DEFAULT 1,
  branch_id uuid,
  parent_id uuid,
  data jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  timeline_id uuid NOT NULL REFERENCES timelines(id) ON DELETE CASCADE,
  type varchar(40) NOT NULL,
  name varchar(200) NOT NULL,
  muted boolean NOT NULL DEFAULT false,
  locked boolean NOT NULL DEFAULT false,
  solo boolean NOT NULL DEFAULT false,
  height integer NOT NULL DEFAULT 60,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS clips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id uuid NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
  source_in real NOT NULL DEFAULT 0,
  source_out real NOT NULL,
  timeline_start real NOT NULL,
  transform jsonb NOT NULL DEFAULT '{}',
  speed real NOT NULL DEFAULT 1,
  effects jsonb NOT NULL DEFAULT '[]',
  keyframes jsonb NOT NULL DEFAULT '[]',
  linked_audio_clip_id uuid,
  muted boolean NOT NULL DEFAULT false,
  label varchar(200)
);
CREATE INDEX IF NOT EXISTS clips_track_idx ON clips(track_id);

CREATE TABLE IF NOT EXISTS timeline_commands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  timeline_id uuid NOT NULL REFERENCES timelines(id) ON DELETE CASCADE,
  type varchar(60) NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  source varchar(20) NOT NULL DEFAULT 'user',
  undone boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS providers (
  id varchar(80) PRIMARY KEY,
  name varchar(200) NOT NULL,
  kind varchar(40) NOT NULL DEFAULT 'external',
  enabled boolean NOT NULL DEFAULT true,
  config jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS models (
  id varchar(120) PRIMARY KEY,
  provider_id varchar(80) NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  name varchar(200) NOT NULL,
  description text,
  published boolean NOT NULL DEFAULT false,
  deprecated boolean NOT NULL DEFAULT false,
  parameter_schema jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS models_provider_idx ON models(provider_id);

CREATE TABLE IF NOT EXISTS model_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id varchar(120) NOT NULL REFERENCES models(id) ON DELETE CASCADE,
  version varchar(80) NOT NULL,
  external_id varchar(200),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS capabilities (
  id varchar(80) PRIMARY KEY,
  name varchar(200) NOT NULL,
  modality varchar(40) NOT NULL
);

CREATE TABLE IF NOT EXISTS model_capabilities (
  model_id varchar(120) NOT NULL REFERENCES models(id) ON DELETE CASCADE,
  capability_id varchar(80) NOT NULL REFERENCES capabilities(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS model_cap_unique ON model_capabilities(model_id, capability_id);

CREATE TABLE IF NOT EXISTS pricing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id varchar(80) NOT NULL,
  model_id varchar(120) NOT NULL,
  unit varchar(40) NOT NULL,
  rate_usd numeric(14,8) NOT NULL,
  minimum_usd numeric(12,4) NOT NULL DEFAULT 0,
  resolution varchar(40),
  quality varchar(40),
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz,
  official_source text,
  approval_status varchar(40) NOT NULL DEFAULT 'approved',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pricing_model_idx ON pricing_rules(model_id);

CREATE TABLE IF NOT EXISTS project_model_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  shot_type varchar(80) NOT NULL,
  model_id varchar(120) NOT NULL,
  weight real NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS proj_model_pref_unique ON project_model_preferences(project_id, shot_type);

CREATE TABLE IF NOT EXISTS generation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shot_id uuid REFERENCES shots(id) ON DELETE SET NULL,
  capability varchar(80) NOT NULL,
  status varchar(40) NOT NULL DEFAULT 'queued',
  progress integer NOT NULL DEFAULT 0,
  priority integer NOT NULL DEFAULT 0,
  provider_id varchar(80),
  model_id varchar(120),
  model_version varchar(80),
  provider_job_id varchar(200),
  request jsonb NOT NULL DEFAULT '{}',
  estimated_cost_usd numeric(12,6),
  actual_cost_usd numeric(12,6),
  pricing_snapshot_id uuid,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS gen_jobs_project_idx ON generation_jobs(project_id);
CREATE INDEX IF NOT EXISTS gen_jobs_status_idx ON generation_jobs(status);

CREATE TABLE IF NOT EXISTS generation_job_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES generation_jobs(id) ON DELETE CASCADE,
  name varchar(80) NOT NULL,
  status varchar(40) NOT NULL DEFAULT 'pending',
  sort_order integer NOT NULL,
  input jsonb DEFAULT '{}',
  output jsonb DEFAULT '{}',
  error text,
  started_at timestamptz,
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS gen_job_steps_job_idx ON generation_job_steps(job_id);

CREATE TABLE IF NOT EXISTS generation_inputs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES generation_jobs(id) ON DELETE CASCADE,
  asset_id uuid REFERENCES assets(id) ON DELETE SET NULL,
  role varchar(60) NOT NULL,
  weight real
);

CREATE TABLE IF NOT EXISTS generation_outputs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES generation_jobs(id) ON DELETE CASCADE,
  asset_id uuid REFERENCES assets(id) ON DELETE SET NULL,
  take_number integer NOT NULL DEFAULT 1,
  accepted boolean
);

CREATE TABLE IF NOT EXISTS prompt_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES generation_jobs(id) ON DELETE CASCADE,
  user_direction text,
  compiled_prompt text NOT NULL,
  negative_prompt text,
  context jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pricing_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rules jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES generation_jobs(id) ON DELETE SET NULL,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_id varchar(80) NOT NULL,
  model_id varchar(120) NOT NULL,
  model_version varchar(80),
  input_tokens numeric(14,0) NOT NULL DEFAULT 0,
  cached_input_tokens numeric(14,0) NOT NULL DEFAULT 0,
  output_tokens numeric(14,0) NOT NULL DEFAULT 0,
  images numeric(10,0) NOT NULL DEFAULT 0,
  output_video_seconds numeric(12,4) NOT NULL DEFAULT 0,
  output_audio_seconds numeric(12,4) NOT NULL DEFAULT 0,
  resolution varchar(40),
  estimated_cost_usd numeric(12,6) NOT NULL,
  actual_provider_cost_usd numeric(12,6),
  customer_cost_usd numeric(12,6) NOT NULL,
  variance_usd numeric(12,6),
  pricing_snapshot_id uuid NOT NULL,
  status varchar(40) NOT NULL DEFAULT 'completed',
  corrects_event_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS usage_project_idx ON usage_events(project_id);
CREATE INDEX IF NOT EXISTS usage_workspace_idx ON usage_events(workspace_id);
CREATE INDEX IF NOT EXISTS usage_created_idx ON usage_events(created_at);

CREATE TABLE IF NOT EXISTS ledger_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  type varchar(40) NOT NULL,
  amount_usd numeric(12,6) NOT NULL,
  balance_after_usd numeric(12,6) NOT NULL,
  usage_event_id uuid REFERENCES usage_events(id) ON DELETE SET NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ledger_workspace_idx ON ledger_transactions(workspace_id);

CREATE TABLE IF NOT EXISTS budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type varchar(40) NOT NULL,
  scope_id uuid NOT NULL,
  limit_usd numeric(12,4) NOT NULL,
  spent_usd numeric(12,4) NOT NULL DEFAULT 0,
  period varchar(40) NOT NULL DEFAULT 'monthly',
  alert_50 boolean NOT NULL DEFAULT false,
  alert_75 boolean NOT NULL DEFAULT false,
  alert_90 boolean NOT NULL DEFAULT false,
  alert_100 boolean NOT NULL DEFAULT false,
  hard_limit boolean NOT NULL DEFAULT false,
  max_job_cost_usd numeric(12,4),
  max_daily_user_spend_usd numeric(12,4),
  require_approval_above_usd numeric(12,4),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  amount_usd numeric(12,4) NOT NULL,
  status varchar(40) NOT NULL DEFAULT 'draft',
  stripe_invoice_id varchar(200),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS credit_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,
  balance_usd numeric(12,4) NOT NULL DEFAULT 100,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS knowledge_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  asset_id uuid REFERENCES assets(id) ON DELETE SET NULL,
  title varchar(500) NOT NULL,
  source_type varchar(40) NOT NULL,
  scope varchar(40) NOT NULL DEFAULT 'project',
  scope_ref_id uuid,
  status varchar(40) NOT NULL DEFAULT 'pending',
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS knowledge_project_idx ON knowledge_sources(project_id);

CREATE TABLE IF NOT EXISTS document_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES knowledge_sources(id) ON DELETE CASCADE,
  chunk_index integer NOT NULL,
  content text NOT NULL,
  citation varchar(500),
  metadata jsonb NOT NULL DEFAULT '{}',
  embedding vector(384),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chunks_source_idx ON document_chunks(source_id);

CREATE TABLE IF NOT EXISTS asset_embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  modality varchar(40) NOT NULL DEFAULT 'visual',
  embedding vector(384),
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS datasets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name varchar(200) NOT NULL,
  type varchar(60) NOT NULL,
  consent jsonb NOT NULL DEFAULT '{}',
  rights jsonb NOT NULL DEFAULT '{}',
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dataset_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id uuid NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  caption text,
  metadata jsonb NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS fine_tunes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  dataset_id uuid REFERENCES datasets(id) ON DELETE SET NULL,
  type varchar(60) NOT NULL,
  config jsonb NOT NULL DEFAULT '{}',
  status varchar(40) NOT NULL DEFAULT 'draft',
  cost_estimate_usd numeric(12,4),
  metrics jsonb NOT NULL DEFAULT '{}',
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS model_deployments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fine_tune_id uuid REFERENCES fine_tunes(id) ON DELETE SET NULL,
  model_id varchar(120) NOT NULL,
  endpoint text,
  status varchar(40) NOT NULL DEFAULT 'inactive',
  config jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type varchar(60) NOT NULL,
  target_id uuid NOT NULL,
  body text NOT NULL,
  timecode real,
  resolved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS comments_target_idx ON comments(target_type, target_id);

CREATE TABLE IF NOT EXISTS annotations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type varchar(60) NOT NULL,
  target_id uuid NOT NULL,
  data jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  target_type varchar(60) NOT NULL,
  target_id uuid NOT NULL,
  status varchar(40) NOT NULL DEFAULT 'needs_review',
  requested_by uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS deliverables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name varchar(300) NOT NULL,
  preset varchar(80) NOT NULL,
  asset_id uuid REFERENCES assets(id) ON DELETE SET NULL,
  status varchar(40) NOT NULL DEFAULT 'pending',
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

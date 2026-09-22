-- Phase E2: Visual workflow builder

CREATE TABLE IF NOT EXISTS workflow_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name varchar(200) NOT NULL,
  description text,
  version integer NOT NULL DEFAULT 1,
  status varchar(40) NOT NULL DEFAULT 'draft',
  graph jsonb NOT NULL DEFAULT '{}',
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS workflow_definitions_project_idx ON workflow_definitions(project_id);

CREATE TABLE IF NOT EXISTS workflow_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  definition_id uuid NOT NULL REFERENCES workflow_definitions(id) ON DELETE CASCADE,
  key varchar(120) NOT NULL,
  type varchar(80) NOT NULL,
  label varchar(200),
  config jsonb NOT NULL DEFAULT '{}',
  position_x real NOT NULL DEFAULT 0,
  position_y real NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS workflow_nodes_definition_idx ON workflow_nodes(definition_id);

CREATE TABLE IF NOT EXISTS workflow_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  definition_id uuid NOT NULL REFERENCES workflow_definitions(id) ON DELETE CASCADE,
  source_key varchar(120) NOT NULL,
  target_key varchar(120) NOT NULL,
  condition jsonb,
  label varchar(120),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS workflow_edges_definition_idx ON workflow_edges(definition_id);

CREATE TABLE IF NOT EXISTS workflow_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  definition_id uuid NOT NULL REFERENCES workflow_definitions(id) ON DELETE CASCADE,
  status varchar(40) NOT NULL DEFAULT 'pending',
  input jsonb NOT NULL DEFAULT '{}',
  output jsonb NOT NULL DEFAULT '{}',
  error text,
  started_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS workflow_runs_project_idx ON workflow_runs(project_id);
CREATE INDEX IF NOT EXISTS workflow_runs_definition_idx ON workflow_runs(definition_id);

CREATE TABLE IF NOT EXISTS workflow_run_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  node_key varchar(120) NOT NULL,
  step_type varchar(80) NOT NULL,
  status varchar(40) NOT NULL DEFAULT 'pending',
  attempt integer NOT NULL DEFAULT 1,
  fan_out boolean NOT NULL DEFAULT false,
  input jsonb NOT NULL DEFAULT '{}',
  output jsonb NOT NULL DEFAULT '{}',
  error text,
  started_at timestamptz,
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS workflow_run_steps_run_idx ON workflow_run_steps(run_id);

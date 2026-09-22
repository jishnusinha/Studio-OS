-- Phase E1: Fine-tuning center (runs, checkpoints, LoRA adapters, metrics)

CREATE TABLE IF NOT EXISTS training_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  fine_tune_id uuid REFERENCES fine_tunes(id) ON DELETE SET NULL,
  dataset_id uuid REFERENCES datasets(id) ON DELETE SET NULL,
  name varchar(200) NOT NULL,
  status varchar(40) NOT NULL DEFAULT 'queued',
  config jsonb NOT NULL DEFAULT '{}',
  cost_estimate_usd numeric(12,4),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS training_runs_project_idx ON training_runs(project_id);

CREATE TABLE IF NOT EXISTS training_checkpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES training_runs(id) ON DELETE CASCADE,
  step integer NOT NULL DEFAULT 0,
  label varchar(200),
  storage_key text,
  metrics jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS training_checkpoints_run_idx ON training_checkpoints(run_id);

CREATE TABLE IF NOT EXISTS adapters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  run_id uuid REFERENCES training_runs(id) ON DELETE SET NULL,
  name varchar(200) NOT NULL,
  rank integer NOT NULL DEFAULT 16,
  base_model varchar(200) NOT NULL,
  storage_key text NOT NULL,
  status varchar(40) NOT NULL DEFAULT 'ready',
  model_hub_id varchar(120),
  config jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS adapters_project_idx ON adapters(project_id);

CREATE TABLE IF NOT EXISTS training_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES training_runs(id) ON DELETE CASCADE,
  step integer NOT NULL DEFAULT 0,
  name varchar(120) NOT NULL,
  value real NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS training_metrics_run_idx ON training_metrics(run_id);

-- Phase B: Continuity Engine (checks, scores, comparisons, constraints, repairs)

CREATE TABLE IF NOT EXISTS continuity_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  scope_type varchar(40) NOT NULL DEFAULT 'project',
  scope_id uuid,
  status varchar(40) NOT NULL DEFAULT 'pending',
  triggered_by uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS continuity_checks_project_idx ON continuity_checks(project_id);
CREATE INDEX IF NOT EXISTS continuity_checks_scope_idx ON continuity_checks(scope_type, scope_id);

CREATE TABLE IF NOT EXISTS continuity_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  check_id uuid NOT NULL REFERENCES continuity_checks(id) ON DELETE CASCADE,
  shot_id uuid NOT NULL REFERENCES shots(id) ON DELETE CASCADE,
  take_id uuid REFERENCES takes(id) ON DELETE SET NULL,
  dimension varchar(40) NOT NULL,
  score real NOT NULL DEFAULT 1,
  details jsonb NOT NULL DEFAULT '{}',
  citations jsonb NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS continuity_scores_check_idx ON continuity_scores(check_id);
CREATE INDEX IF NOT EXISTS continuity_scores_shot_idx ON continuity_scores(shot_id);
CREATE INDEX IF NOT EXISTS continuity_scores_dimension_idx ON continuity_scores(dimension);

CREATE TABLE IF NOT EXISTS shot_comparisons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  check_id uuid NOT NULL REFERENCES continuity_checks(id) ON DELETE CASCADE,
  left_shot_id uuid NOT NULL REFERENCES shots(id) ON DELETE CASCADE,
  right_shot_id uuid NOT NULL REFERENCES shots(id) ON DELETE CASCADE,
  left_take_id uuid REFERENCES takes(id) ON DELETE SET NULL,
  right_take_id uuid REFERENCES takes(id) ON DELETE SET NULL,
  embedding_distance real,
  diff jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS shot_comparisons_check_idx ON shot_comparisons(check_id);

CREATE TABLE IF NOT EXISTS continuity_constraints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  entity_type varchar(40) NOT NULL,
  entity_id uuid,
  key varchar(200) NOT NULL,
  value text NOT NULL,
  priority integer NOT NULL DEFAULT 0,
  auto_enforce boolean NOT NULL DEFAULT true,
  scene_range varchar(100),
  locked boolean NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS continuity_constraints_project_idx ON continuity_constraints(project_id);
CREATE INDEX IF NOT EXISTS continuity_constraints_entity_idx ON continuity_constraints(entity_type, entity_id);

CREATE TABLE IF NOT EXISTS continuity_repairs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  check_id uuid NOT NULL REFERENCES continuity_checks(id) ON DELETE CASCADE,
  score_id uuid NOT NULL REFERENCES continuity_scores(id) ON DELETE CASCADE,
  shot_id uuid NOT NULL REFERENCES shots(id) ON DELETE CASCADE,
  strategy varchar(80) NOT NULL DEFAULT 'regenerate',
  job_id uuid REFERENCES generation_jobs(id) ON DELETE SET NULL,
  status varchar(40) NOT NULL DEFAULT 'queued',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS continuity_repairs_check_idx ON continuity_repairs(check_id);
CREATE INDEX IF NOT EXISTS continuity_repairs_score_idx ON continuity_repairs(score_id);

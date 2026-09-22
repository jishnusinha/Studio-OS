-- Phase D1: Pro color (grades, LUTs, looks, per-clip state, scopes)

CREATE TABLE IF NOT EXISTS color_grades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name varchar(300) NOT NULL,
  node_graph jsonb NOT NULL DEFAULT '{"nodes":[],"edges":[]}',
  version integer NOT NULL DEFAULT 1,
  look_id uuid,
  lut_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS color_grades_project_idx ON color_grades(project_id);

CREATE TABLE IF NOT EXISTS luts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name varchar(300) NOT NULL,
  asset_id uuid REFERENCES assets(id) ON DELETE SET NULL,
  storage_key text,
  format varchar(40) NOT NULL DEFAULT 'cube',
  size integer,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS luts_project_idx ON luts(project_id);

CREATE TABLE IF NOT EXISTS looks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name varchar(300) NOT NULL,
  grade_id uuid REFERENCES color_grades(id) ON DELETE SET NULL,
  lut_id uuid REFERENCES luts(id) ON DELETE SET NULL,
  parameters jsonb NOT NULL DEFAULT '{}',
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS looks_project_idx ON looks(project_id);

ALTER TABLE color_grades
  DROP CONSTRAINT IF EXISTS color_grades_look_id_fkey;
ALTER TABLE color_grades
  ADD CONSTRAINT color_grades_look_id_fkey
  FOREIGN KEY (look_id) REFERENCES looks(id) ON DELETE SET NULL;
ALTER TABLE color_grades
  DROP CONSTRAINT IF EXISTS color_grades_lut_id_fkey;
ALTER TABLE color_grades
  ADD CONSTRAINT color_grades_lut_id_fkey
  FOREIGN KEY (lut_id) REFERENCES luts(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS clip_color_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  timeline_id uuid REFERENCES timelines(id) ON DELETE CASCADE,
  clip_id uuid NOT NULL,
  grade_id uuid REFERENCES color_grades(id) ON DELETE SET NULL,
  lift jsonb NOT NULL DEFAULT '{"r":0,"g":0,"b":0}',
  gamma jsonb NOT NULL DEFAULT '{"r":1,"g":1,"b":1}',
  gain jsonb NOT NULL DEFAULT '{"r":1,"g":1,"b":1}',
  curves jsonb NOT NULL DEFAULT '{"master":[[0,0],[1,1]]}',
  qualifiers jsonb NOT NULL DEFAULT '{"hue":[0,360],"saturation":[0,1],"luminance":[0,1]}',
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS clip_color_state_project_idx ON clip_color_state(project_id);
CREATE INDEX IF NOT EXISTS clip_color_state_clip_idx ON clip_color_state(project_id, clip_id);
CREATE UNIQUE INDEX IF NOT EXISTS clip_color_state_timeline_clip_uidx
  ON clip_color_state(timeline_id, clip_id)
  WHERE timeline_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS color_scopes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  timeline_id uuid REFERENCES timelines(id) ON DELETE SET NULL,
  clip_id uuid,
  asset_id uuid REFERENCES assets(id) ON DELETE SET NULL,
  scope_type varchar(40) NOT NULL DEFAULT 'waveform',
  data jsonb NOT NULL DEFAULT '{}',
  sampled_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS color_scopes_project_idx ON color_scopes(project_id);
CREATE INDEX IF NOT EXISTS color_scopes_clip_idx ON color_scopes(clip_id);

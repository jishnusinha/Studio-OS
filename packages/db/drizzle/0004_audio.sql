-- Phase C1: Audio Lab (dialogue, ADR, stems, dubbing, mix buses)

CREATE TABLE IF NOT EXISTS dialogue_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  script_version_id uuid REFERENCES script_versions(id) ON DELETE SET NULL,
  scene_id uuid REFERENCES scenes(id) ON DELETE SET NULL,
  character_id uuid REFERENCES characters(id) ON DELETE SET NULL,
  speaker varchar(200),
  text text NOT NULL,
  line_index integer NOT NULL DEFAULT 0,
  start_sec real,
  end_sec real,
  status varchar(40) NOT NULL DEFAULT 'draft',
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dialogue_lines_project_idx ON dialogue_lines(project_id);
CREATE INDEX IF NOT EXISTS dialogue_lines_script_version_idx ON dialogue_lines(script_version_id);

CREATE TABLE IF NOT EXISTS adr_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  dialogue_line_id uuid REFERENCES dialogue_lines(id) ON DELETE SET NULL,
  scene_id uuid REFERENCES scenes(id) ON DELETE SET NULL,
  character_id uuid REFERENCES characters(id) ON DELETE SET NULL,
  name varchar(300) NOT NULL,
  status varchar(40) NOT NULL DEFAULT 'open',
  loop_in_sec real,
  loop_out_sec real,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS adr_sessions_project_idx ON adr_sessions(project_id);
CREATE INDEX IF NOT EXISTS adr_sessions_line_idx ON adr_sessions(dialogue_line_id);

CREATE TABLE IF NOT EXISTS adr_takes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES adr_sessions(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  number integer NOT NULL,
  asset_id uuid REFERENCES assets(id) ON DELETE SET NULL,
  rating integer,
  selected boolean NOT NULL DEFAULT false,
  status varchar(40) NOT NULL DEFAULT 'draft',
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS adr_takes_session_idx ON adr_takes(session_id);
CREATE INDEX IF NOT EXISTS adr_takes_project_idx ON adr_takes(project_id);

CREATE TABLE IF NOT EXISTS audio_stems (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source_asset_id uuid REFERENCES assets(id) ON DELETE SET NULL,
  asset_id uuid REFERENCES assets(id) ON DELETE SET NULL,
  job_id uuid REFERENCES generation_jobs(id) ON DELETE SET NULL,
  stem_type varchar(40) NOT NULL DEFAULT 'other',
  label varchar(200),
  sort_order integer NOT NULL DEFAULT 0,
  status varchar(40) NOT NULL DEFAULT 'pending',
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audio_stems_project_idx ON audio_stems(project_id);
CREATE INDEX IF NOT EXISTS audio_stems_source_idx ON audio_stems(source_asset_id);

CREATE TABLE IF NOT EXISTS dubbing_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  dialogue_line_id uuid REFERENCES dialogue_lines(id) ON DELETE SET NULL,
  language varchar(40) NOT NULL,
  asset_id uuid REFERENCES assets(id) ON DELETE SET NULL,
  lip_sync_drift_ms real,
  status varchar(40) NOT NULL DEFAULT 'draft',
  variant_label varchar(200),
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dubbing_tracks_project_idx ON dubbing_tracks(project_id);
CREATE INDEX IF NOT EXISTS dubbing_tracks_language_idx ON dubbing_tracks(project_id, language);

CREATE TABLE IF NOT EXISTS audio_mix_buses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name varchar(200) NOT NULL,
  bus_type varchar(40) NOT NULL DEFAULT 'bus',
  gain_db real NOT NULL DEFAULT 0,
  pan real NOT NULL DEFAULT 0,
  muted boolean NOT NULL DEFAULT false,
  solo boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  asset_id uuid REFERENCES assets(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audio_mix_buses_project_idx ON audio_mix_buses(project_id);

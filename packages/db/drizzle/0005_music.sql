-- Phase C3: Music Studio DAW (MIDI, tempo, stems, score cues/markers)

CREATE TABLE IF NOT EXISTS midi_clips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  timeline_id uuid REFERENCES timelines(id) ON DELETE SET NULL,
  name varchar(300) NOT NULL,
  start_sec real NOT NULL DEFAULT 0,
  duration_sec real NOT NULL DEFAULT 4,
  channel integer NOT NULL DEFAULT 0,
  instrument varchar(120),
  job_id uuid REFERENCES generation_jobs(id) ON DELETE SET NULL,
  status varchar(40) NOT NULL DEFAULT 'draft',
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS midi_clips_project_idx ON midi_clips(project_id);
CREATE INDEX IF NOT EXISTS midi_clips_timeline_idx ON midi_clips(timeline_id);

CREATE TABLE IF NOT EXISTS midi_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clip_id uuid NOT NULL REFERENCES midi_clips(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  time_sec real NOT NULL DEFAULT 0,
  duration_sec real NOT NULL DEFAULT 0.25,
  note integer NOT NULL,
  velocity integer NOT NULL DEFAULT 80,
  event_type varchar(40) NOT NULL DEFAULT 'note',
  channel integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS midi_events_clip_idx ON midi_events(clip_id);
CREATE INDEX IF NOT EXISTS midi_events_project_idx ON midi_events(project_id);

CREATE TABLE IF NOT EXISTS score_cues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  timeline_id uuid REFERENCES timelines(id) ON DELETE SET NULL,
  name varchar(300) NOT NULL,
  time_sec real NOT NULL DEFAULT 0,
  cue_type varchar(60) NOT NULL DEFAULT 'hit',
  description text,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS score_cues_project_idx ON score_cues(project_id);
CREATE INDEX IF NOT EXISTS score_cues_timeline_idx ON score_cues(timeline_id);

CREATE TABLE IF NOT EXISTS tempo_maps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  timeline_id uuid REFERENCES timelines(id) ON DELETE SET NULL,
  name varchar(200) NOT NULL DEFAULT 'Tempo',
  bpm real NOT NULL DEFAULT 120,
  time_signature varchar(20) NOT NULL DEFAULT '4/4',
  start_sec real NOT NULL DEFAULT 0,
  points jsonb NOT NULL DEFAULT '[]',
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tempo_maps_project_idx ON tempo_maps(project_id);
CREATE INDEX IF NOT EXISTS tempo_maps_timeline_idx ON tempo_maps(timeline_id);

CREATE TABLE IF NOT EXISTS music_stems (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name varchar(200) NOT NULL,
  asset_id uuid REFERENCES assets(id) ON DELETE SET NULL,
  stem_type varchar(40) NOT NULL DEFAULT 'mix',
  muted boolean NOT NULL DEFAULT false,
  solo boolean NOT NULL DEFAULT false,
  gain_db real NOT NULL DEFAULT 0,
  pan real NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS music_stems_project_idx ON music_stems(project_id);

CREATE TABLE IF NOT EXISTS score_markers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  timeline_id uuid NOT NULL REFERENCES timelines(id) ON DELETE CASCADE,
  time_sec real NOT NULL DEFAULT 0,
  label varchar(200) NOT NULL,
  color varchar(40),
  kind varchar(40) NOT NULL DEFAULT 'score',
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS score_markers_project_idx ON score_markers(project_id);
CREATE INDEX IF NOT EXISTS score_markers_timeline_idx ON score_markers(timeline_id);

-- Phase D2: Multicam groups/angles + masks, roto shapes, mattes

CREATE TABLE IF NOT EXISTS multicam_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  timeline_id uuid REFERENCES timelines(id) ON DELETE SET NULL,
  name varchar(300) NOT NULL,
  active_angle_id uuid,
  sync_offset_sec real NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS multicam_groups_project_idx ON multicam_groups(project_id);
CREATE INDEX IF NOT EXISTS multicam_groups_timeline_idx ON multicam_groups(timeline_id);

CREATE TABLE IF NOT EXISTS multicam_angles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES multicam_groups(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name varchar(200) NOT NULL,
  label varchar(40) NOT NULL DEFAULT 'A',
  asset_id uuid REFERENCES assets(id) ON DELETE SET NULL,
  sort_order integer NOT NULL DEFAULT 0,
  offset_sec real NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS multicam_angles_group_idx ON multicam_angles(group_id);
CREATE INDEX IF NOT EXISTS multicam_angles_project_idx ON multicam_angles(project_id);

ALTER TABLE multicam_groups
  DROP CONSTRAINT IF EXISTS multicam_groups_active_angle_id_fkey;
ALTER TABLE multicam_groups
  ADD CONSTRAINT multicam_groups_active_angle_id_fkey
  FOREIGN KEY (active_angle_id) REFERENCES multicam_angles(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS masks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  timeline_id uuid REFERENCES timelines(id) ON DELETE SET NULL,
  clip_id uuid,
  name varchar(300) NOT NULL,
  shape_type varchar(40) NOT NULL DEFAULT 'bezier',
  parameters jsonb NOT NULL DEFAULT '{}',
  feather real NOT NULL DEFAULT 0,
  inverted boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS masks_project_idx ON masks(project_id);
CREATE INDEX IF NOT EXISTS masks_clip_idx ON masks(clip_id);

CREATE TABLE IF NOT EXISTS roto_shapes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  mask_id uuid REFERENCES masks(id) ON DELETE SET NULL,
  clip_id uuid,
  name varchar(300) NOT NULL,
  points jsonb NOT NULL DEFAULT '[]',
  frame_in integer NOT NULL DEFAULT 0,
  frame_out integer NOT NULL DEFAULT 24,
  keyframes jsonb NOT NULL DEFAULT '[]',
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS roto_shapes_project_idx ON roto_shapes(project_id);
CREATE INDEX IF NOT EXISTS roto_shapes_mask_idx ON roto_shapes(mask_id);

CREATE TABLE IF NOT EXISTS mattes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  roto_shape_id uuid REFERENCES roto_shapes(id) ON DELETE SET NULL,
  mask_id uuid REFERENCES masks(id) ON DELETE SET NULL,
  asset_id uuid REFERENCES assets(id) ON DELETE SET NULL,
  job_id uuid REFERENCES generation_jobs(id) ON DELETE SET NULL,
  status varchar(40) NOT NULL DEFAULT 'pending',
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mattes_project_idx ON mattes(project_id);
CREATE INDEX IF NOT EXISTS mattes_roto_idx ON mattes(roto_shape_id);

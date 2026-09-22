-- Phase E3: Realtime CRDT collaboration

ALTER TABLE comments ADD COLUMN IF NOT EXISTS parent_id uuid;
CREATE INDEX IF NOT EXISTS comments_parent_idx ON comments(parent_id);

CREATE TABLE IF NOT EXISTS collab_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name varchar(200) NOT NULL,
  kind varchar(60) NOT NULL DEFAULT 'timeline',
  target_type varchar(60),
  target_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS collab_rooms_project_idx ON collab_rooms(project_id);

CREATE TABLE IF NOT EXISTS presence_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  room_id uuid REFERENCES collab_rooms(id) ON DELETE SET NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  display_name varchar(200),
  color varchar(40),
  cursor_x real,
  cursor_y real,
  selection jsonb NOT NULL DEFAULT '{}',
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS presence_sessions_project_idx ON presence_sessions(project_id);
CREATE INDEX IF NOT EXISTS presence_sessions_room_idx ON presence_sessions(room_id);

CREATE TABLE IF NOT EXISTS crdt_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  room_id uuid REFERENCES collab_rooms(id) ON DELETE CASCADE,
  doc_key varchar(200) NOT NULL,
  state bytea,
  state_text text,
  version integer NOT NULL DEFAULT 0,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS crdt_documents_project_idx ON crdt_documents(project_id);
CREATE INDEX IF NOT EXISTS crdt_documents_key_idx ON crdt_documents(project_id, doc_key);

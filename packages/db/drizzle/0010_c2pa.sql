-- Phase E5: C2PA content credentials / provenance

CREATE TABLE IF NOT EXISTS content_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  claim_generator varchar(200) NOT NULL DEFAULT 'StudioOS',
  title varchar(500),
  status varchar(40) NOT NULL DEFAULT 'signed',
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS content_credentials_asset_idx ON content_credentials(asset_id);
CREATE INDEX IF NOT EXISTS content_credentials_project_idx ON content_credentials(project_id);

CREATE TABLE IF NOT EXISTS provenance_manifests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  content_credential_id uuid REFERENCES content_credentials(id) ON DELETE SET NULL,
  format varchar(40) NOT NULL DEFAULT 'c2pa-lite',
  claim_json jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS provenance_manifests_asset_idx ON provenance_manifests(asset_id);

CREATE TABLE IF NOT EXISTS provenance_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manifest_id uuid NOT NULL REFERENCES provenance_manifests(id) ON DELETE CASCADE,
  algorithm varchar(40) NOT NULL DEFAULT 'RSA-SHA256',
  public_key_pem text NOT NULL,
  signature text NOT NULL,
  signed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS provenance_signatures_manifest_idx ON provenance_signatures(manifest_id);

CREATE TABLE IF NOT EXISTS provenance_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manifest_id uuid NOT NULL REFERENCES provenance_manifests(id) ON DELETE CASCADE,
  action varchar(80) NOT NULL,
  software_agent varchar(200),
  model_id varchar(120),
  prompt text,
  parameters jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS provenance_actions_manifest_idx ON provenance_actions(manifest_id);

CREATE TABLE IF NOT EXISTS provenance_ingredients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manifest_id uuid NOT NULL REFERENCES provenance_manifests(id) ON DELETE CASCADE,
  asset_id uuid REFERENCES assets(id) ON DELETE SET NULL,
  relation_type varchar(60) NOT NULL DEFAULT 'derivedFrom',
  title varchar(500),
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS provenance_ingredients_manifest_idx ON provenance_ingredients(manifest_id);

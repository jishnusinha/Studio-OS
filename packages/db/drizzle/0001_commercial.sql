-- Phase C1–C3: Commercial Studio (packshots, campaigns, beats, variants, templates)

CREATE TABLE IF NOT EXISTS packshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  asset_id uuid REFERENCES assets(id) ON DELETE SET NULL,
  url text,
  label varchar(200),
  sort_order integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS packshots_product_idx ON packshots(product_id);
CREATE INDEX IF NOT EXISTS packshots_project_idx ON packshots(project_id);

CREATE TABLE IF NOT EXISTS campaign_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug varchar(80) NOT NULL,
  name varchar(200) NOT NULL,
  description text,
  beats jsonb NOT NULL DEFAULT '[]',
  default_duration_sec real NOT NULL DEFAULT 18,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS campaign_templates_slug_uidx ON campaign_templates(slug);

CREATE TABLE IF NOT EXISTS campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  brand_id uuid REFERENCES brands(id) ON DELETE SET NULL,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  template_id uuid REFERENCES campaign_templates(id) ON DELETE SET NULL,
  name varchar(300) NOT NULL,
  status varchar(40) NOT NULL DEFAULT 'draft',
  duration_sec real NOT NULL DEFAULT 18,
  data jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS campaigns_project_idx ON campaigns(project_id);

CREATE TABLE IF NOT EXISTS campaign_beats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  beat_type varchar(40) NOT NULL,
  label varchar(200),
  start_sec real NOT NULL DEFAULT 0,
  end_sec real NOT NULL DEFAULT 2,
  prompt text,
  copy text,
  shot_id uuid REFERENCES shots(id) ON DELETE SET NULL,
  locked boolean NOT NULL DEFAULT false,
  status varchar(40) NOT NULL DEFAULT 'draft',
  sort_order integer NOT NULL DEFAULT 0,
  data jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS campaign_beats_campaign_idx ON campaign_beats(campaign_id);
CREATE INDEX IF NOT EXISTS campaign_beats_project_idx ON campaign_beats(project_id);

CREATE TABLE IF NOT EXISTS campaign_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  format varchar(20) NOT NULL,
  language varchar(40) NOT NULL,
  duration_sec real NOT NULL,
  status varchar(40) NOT NULL DEFAULT 'missing',
  branch_id uuid,
  localization jsonb NOT NULL DEFAULT '{}',
  asset_id uuid REFERENCES assets(id) ON DELETE SET NULL,
  job_id uuid REFERENCES generation_jobs(id) ON DELETE SET NULL,
  estimated_cost_usd numeric(12,6),
  reused_beat_ids jsonb NOT NULL DEFAULT '[]',
  regenerated_beat_types jsonb NOT NULL DEFAULT '[]',
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS campaign_variants_campaign_idx ON campaign_variants(campaign_id);
CREATE UNIQUE INDEX IF NOT EXISTS campaign_variants_cell_uidx
  ON campaign_variants(campaign_id, format, language, duration_sec);

-- Seed beat-grammar templates
INSERT INTO campaign_templates (slug, name, description, beats, default_duration_sec)
VALUES
  (
    'product-hero',
    'Product Hero',
    'Hero product showcase with clear CTA',
    '[
      {"type":"HOOK","label":"Hook","startSec":0,"endSec":2,"promptHint":"Bold product reveal"},
      {"type":"PRODUCT","label":"Product","startSec":2,"endSec":8,"locked":true,"promptHint":"Packshot hero angle"},
      {"type":"BENEFIT","label":"Benefit","startSec":8,"endSec":13,"promptHint":"Key benefit moment"},
      {"type":"PROOF","label":"Proof","startSec":13,"endSec":16,"promptHint":"Social proof beat"},
      {"type":"CTA","label":"CTA","startSec":16,"endSec":18,"promptHint":"End card CTA"}
    ]'::jsonb,
    18
  ),
  (
    'ugc-talking-head',
    'UGC Talking Head',
    'Creator-style talking head endorsement',
    '[
      {"type":"HOOK","label":"Hook","startSec":0,"endSec":2,"promptHint":"Direct-to-camera hook"},
      {"type":"PROBLEM","label":"Problem","startSec":2,"endSec":5,"promptHint":"Relatable pain point"},
      {"type":"PRODUCT","label":"Product","startSec":5,"endSec":10,"locked":true,"promptHint":"Show product in hand"},
      {"type":"BENEFIT","label":"Benefit","startSec":10,"endSec":14,"promptHint":"Personal benefit story"},
      {"type":"CTA","label":"CTA","startSec":14,"endSec":16,"promptHint":"Soft CTA"}
    ]'::jsonb,
    16
  ),
  (
    'problem-solution',
    'Problem/Solution',
    'Classic problem → product solution arc',
    '[
      {"type":"HOOK","label":"Hook","startSec":0,"endSec":2},
      {"type":"PROBLEM","label":"Problem","startSec":2,"endSec":6},
      {"type":"PRODUCT","label":"Product","startSec":6,"endSec":11,"locked":true},
      {"type":"BENEFIT","label":"Benefit","startSec":11,"endSec":15},
      {"type":"CTA","label":"CTA","startSec":15,"endSec":18}
    ]'::jsonb,
    18
  ),
  (
    'before-after',
    'Before/After',
    'Transformation before/after with product middle',
    '[
      {"type":"HOOK","label":"Before","startSec":0,"endSec":3,"promptHint":"Before state"},
      {"type":"PRODUCT","label":"Product","startSec":3,"endSec":8,"locked":true},
      {"type":"BENEFIT","label":"After","startSec":8,"endSec":13,"promptHint":"After reveal"},
      {"type":"PROOF","label":"Proof","startSec":13,"endSec":16},
      {"type":"CTA","label":"CTA","startSec":16,"endSec":18}
    ]'::jsonb,
    18
  ),
  (
    'demo',
    'Demo',
    'Hands-on product demonstration',
    '[
      {"type":"HOOK","label":"Hook","startSec":0,"endSec":2},
      {"type":"PRODUCT","label":"Demo","startSec":2,"endSec":12,"locked":true,"promptHint":"Step-by-step demo"},
      {"type":"BENEFIT","label":"Benefit","startSec":12,"endSec":16},
      {"type":"CTA","label":"CTA","startSec":16,"endSec":18}
    ]'::jsonb,
    18
  ),
  (
    'lifestyle',
    'Lifestyle',
    'Aspirational lifestyle integration',
    '[
      {"type":"HOOK","label":"Hook","startSec":0,"endSec":3},
      {"type":"PRODUCT","label":"Lifestyle","startSec":3,"endSec":12,"locked":true},
      {"type":"BENEFIT","label":"Benefit","startSec":12,"endSec":16},
      {"type":"CTA","label":"CTA","startSec":16,"endSec":20}
    ]'::jsonb,
    20
  ),
  (
    'explainer',
    'Explainer',
    'Feature explainer with proof and CTA',
    '[
      {"type":"HOOK","label":"Hook","startSec":0,"endSec":2},
      {"type":"PROBLEM","label":"Context","startSec":2,"endSec":5},
      {"type":"PRODUCT","label":"How it works","startSec":5,"endSec":12,"locked":true},
      {"type":"BENEFIT","label":"Benefit","startSec":12,"endSec":16},
      {"type":"PROOF","label":"Proof","startSec":16,"endSec":20},
      {"type":"CTA","label":"CTA","startSec":20,"endSec":24}
    ]'::jsonb,
    24
  ),
  (
    'social-hook',
    'Social Hook',
    'Short social-first hook package',
    '[
      {"type":"HOOK","label":"Hook","startSec":0,"endSec":1.5},
      {"type":"PRODUCT","label":"Product","startSec":1.5,"endSec":5,"locked":true},
      {"type":"BENEFIT","label":"Benefit","startSec":5,"endSec":7},
      {"type":"CTA","label":"CTA","startSec":7,"endSec":8}
    ]'::jsonb,
    8
  ),
  (
    'cinematic-brand-film',
    'Cinematic Brand Film',
    'Premium brand film grammar',
    '[
      {"type":"HOOK","label":"Cold open","startSec":0,"endSec":4},
      {"type":"PROBLEM","label":"Tension","startSec":4,"endSec":10},
      {"type":"PRODUCT","label":"Brand moment","startSec":10,"endSec":22,"locked":true},
      {"type":"BENEFIT","label":"Emotion","startSec":22,"endSec":28},
      {"type":"PROOF","label":"World","startSec":28,"endSec":34},
      {"type":"CTA","label":"End card","startSec":34,"endSec":40}
    ]'::jsonb,
    40
  )
ON CONFLICT (slug) DO NOTHING;

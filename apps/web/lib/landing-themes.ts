export type LandingThemeId = 'cinema' | 'commercial' | 'pro';

export const LANDING_THEME_STORAGE_KEY = 'studioos-landing-theme';

export interface LandingThemeMeta {
  id: LandingThemeId;
  label: string;
  description: string;
  accentLabel: string;
}

export const LANDING_THEMES: LandingThemeMeta[] = [
  {
    id: 'cinema',
    label: 'Cinema',
    description: 'Narrative production — story, shots, continuity, and delivery on one timeline.',
    accentLabel: 'Mint charcoal',
  },
  {
    id: 'commercial',
    label: 'Commercial',
    description: 'Brand DNA, campaigns, and variant factories without leaving the project graph.',
    accentLabel: 'Amber slate',
  },
  {
    id: 'pro',
    label: 'Pro',
    description: 'Audio, music, color, multicam, and workflows for precision post.',
    accentLabel: 'Steel cyan',
  },
];

export const DEFAULT_LANDING_THEME: LandingThemeId = 'cinema';

export function isLandingThemeId(value: unknown): value is LandingThemeId {
  return value === 'cinema' || value === 'commercial' || value === 'pro';
}

export function parseLandingTheme(value: string | null | undefined): LandingThemeId {
  if (isLandingThemeId(value)) return value;
  return DEFAULT_LANDING_THEME;
}

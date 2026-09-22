import type { BeatGrammarItem } from '@studio-os/contracts';

export const DEFAULT_BEAT_GRAMMAR: BeatGrammarItem[] = [
  { type: 'HOOK', label: 'Hook', startSec: 0, endSec: 2 },
  { type: 'PROBLEM', label: 'Problem', startSec: 2, endSec: 5 },
  { type: 'PRODUCT', label: 'Product', startSec: 5, endSec: 9, locked: true },
  { type: 'BENEFIT', label: 'Benefit', startSec: 9, endSec: 13 },
  { type: 'PROOF', label: 'Proof', startSec: 13, endSec: 16 },
  { type: 'CTA', label: 'CTA', startSec: 16, endSec: 18 },
];

/** In-memory fallback if DB templates are not yet seeded. */
export const FALLBACK_TEMPLATES: Array<{
  slug: string;
  name: string;
  description: string;
  defaultDurationSec: number;
  beats: BeatGrammarItem[];
}> = [
  {
    slug: 'product-hero',
    name: 'Product Hero',
    description: 'Hero product showcase with clear CTA',
    defaultDurationSec: 18,
    beats: [
      { type: 'HOOK', label: 'Hook', startSec: 0, endSec: 2, promptHint: 'Bold product reveal' },
      {
        type: 'PRODUCT',
        label: 'Product',
        startSec: 2,
        endSec: 8,
        locked: true,
        promptHint: 'Packshot hero angle',
      },
      { type: 'BENEFIT', label: 'Benefit', startSec: 8, endSec: 13 },
      { type: 'PROOF', label: 'Proof', startSec: 13, endSec: 16 },
      { type: 'CTA', label: 'CTA', startSec: 16, endSec: 18 },
    ],
  },
  {
    slug: 'ugc-talking-head',
    name: 'UGC Talking Head',
    description: 'Creator-style talking head endorsement',
    defaultDurationSec: 16,
    beats: [
      { type: 'HOOK', label: 'Hook', startSec: 0, endSec: 2 },
      { type: 'PROBLEM', label: 'Problem', startSec: 2, endSec: 5 },
      { type: 'PRODUCT', label: 'Product', startSec: 5, endSec: 10, locked: true },
      { type: 'BENEFIT', label: 'Benefit', startSec: 10, endSec: 14 },
      { type: 'CTA', label: 'CTA', startSec: 14, endSec: 16 },
    ],
  },
  {
    slug: 'problem-solution',
    name: 'Problem/Solution',
    description: 'Classic problem → product solution arc',
    defaultDurationSec: 18,
    beats: [
      { type: 'HOOK', label: 'Hook', startSec: 0, endSec: 2 },
      { type: 'PROBLEM', label: 'Problem', startSec: 2, endSec: 6 },
      { type: 'PRODUCT', label: 'Product', startSec: 6, endSec: 11, locked: true },
      { type: 'BENEFIT', label: 'Benefit', startSec: 11, endSec: 15 },
      { type: 'CTA', label: 'CTA', startSec: 15, endSec: 18 },
    ],
  },
  {
    slug: 'before-after',
    name: 'Before/After',
    description: 'Transformation before/after with product middle',
    defaultDurationSec: 18,
    beats: [
      { type: 'HOOK', label: 'Before', startSec: 0, endSec: 3 },
      { type: 'PRODUCT', label: 'Product', startSec: 3, endSec: 8, locked: true },
      { type: 'BENEFIT', label: 'After', startSec: 8, endSec: 13 },
      { type: 'PROOF', label: 'Proof', startSec: 13, endSec: 16 },
      { type: 'CTA', label: 'CTA', startSec: 16, endSec: 18 },
    ],
  },
  {
    slug: 'demo',
    name: 'Demo',
    description: 'Hands-on product demonstration',
    defaultDurationSec: 18,
    beats: [
      { type: 'HOOK', label: 'Hook', startSec: 0, endSec: 2 },
      { type: 'PRODUCT', label: 'Demo', startSec: 2, endSec: 12, locked: true },
      { type: 'BENEFIT', label: 'Benefit', startSec: 12, endSec: 16 },
      { type: 'CTA', label: 'CTA', startSec: 16, endSec: 18 },
    ],
  },
  {
    slug: 'lifestyle',
    name: 'Lifestyle',
    description: 'Aspirational lifestyle integration',
    defaultDurationSec: 20,
    beats: [
      { type: 'HOOK', label: 'Hook', startSec: 0, endSec: 3 },
      { type: 'PRODUCT', label: 'Lifestyle', startSec: 3, endSec: 12, locked: true },
      { type: 'BENEFIT', label: 'Benefit', startSec: 12, endSec: 16 },
      { type: 'CTA', label: 'CTA', startSec: 16, endSec: 20 },
    ],
  },
  {
    slug: 'explainer',
    name: 'Explainer',
    description: 'Feature explainer with proof and CTA',
    defaultDurationSec: 24,
    beats: [
      { type: 'HOOK', label: 'Hook', startSec: 0, endSec: 2 },
      { type: 'PROBLEM', label: 'Context', startSec: 2, endSec: 5 },
      { type: 'PRODUCT', label: 'How it works', startSec: 5, endSec: 12, locked: true },
      { type: 'BENEFIT', label: 'Benefit', startSec: 12, endSec: 16 },
      { type: 'PROOF', label: 'Proof', startSec: 16, endSec: 20 },
      { type: 'CTA', label: 'CTA', startSec: 20, endSec: 24 },
    ],
  },
  {
    slug: 'social-hook',
    name: 'Social Hook',
    description: 'Short social-first hook package',
    defaultDurationSec: 8,
    beats: [
      { type: 'HOOK', label: 'Hook', startSec: 0, endSec: 1.5 },
      { type: 'PRODUCT', label: 'Product', startSec: 1.5, endSec: 5, locked: true },
      { type: 'BENEFIT', label: 'Benefit', startSec: 5, endSec: 7 },
      { type: 'CTA', label: 'CTA', startSec: 7, endSec: 8 },
    ],
  },
  {
    slug: 'cinematic-brand-film',
    name: 'Cinematic Brand Film',
    description: 'Premium brand film grammar',
    defaultDurationSec: 40,
    beats: [
      { type: 'HOOK', label: 'Cold open', startSec: 0, endSec: 4 },
      { type: 'PROBLEM', label: 'Tension', startSec: 4, endSec: 10 },
      { type: 'PRODUCT', label: 'Brand moment', startSec: 10, endSec: 22, locked: true },
      { type: 'BENEFIT', label: 'Emotion', startSec: 22, endSec: 28 },
      { type: 'PROOF', label: 'World', startSec: 28, endSec: 34 },
      { type: 'CTA', label: 'End card', startSec: 34, endSec: 40 },
    ],
  },
];

export const DEFAULT_VARIANT_FORMATS = ['9:16', '16:9', '1:1', '4:5'] as const;
export const DEFAULT_VARIANT_LANGUAGES = ['en-US', 'en-GB', 'hi-IN', 'bn-IN', 'es-ES'] as const;
export const DEFAULT_VARIANT_DURATIONS = [6, 15, 30, 60] as const;

/** Rough mock cost per second of regenerated video. */
export const VARIANT_COST_PER_SEC_USD = 0.08;

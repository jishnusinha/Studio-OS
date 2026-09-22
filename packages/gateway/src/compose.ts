import type { LockedFact, ShotDna, StoryBible } from '@studio-os/contracts';
import { compilePrompt, type CompiledPrompt } from './compiler.js';

export function dnaSection(label: string, value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim() ? `${label}: ${value.trim()}` : '';
  if (Array.isArray(value)) {
    const items = value.map(String).filter(Boolean);
    return items.length ? `${label}: ${items.join(', ')}` : '';
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).filter(
      ([, v]) => v != null && v !== '' && !(Array.isArray(v) && v.length === 0),
    );
    if (entries.length === 0) return '';
    const prose = entries
      .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
      .join('; ');
    return `${label}: ${prose}`;
  }
  return `${label}: ${String(value)}`;
}

/** Plain DNA / canon rows used to compose generation prompts (no DB dependency). */
export interface PromptLayerInput {
  shot?: {
    description?: string | null;
    shotDna?: ShotDna | Record<string, unknown> | null;
  } | null;
  character?: {
    name?: string | null;
    bio?: string | null;
    identity?: unknown;
    body?: unknown;
    wardrobe?: unknown;
    acting?: unknown;
  } | null;
  location?: {
    name?: string | null;
    description?: string | null;
    dna?: unknown;
  } | null;
  style?: {
    dna?: unknown;
  } | null;
  bible?: StoryBible | null;
  scene?: {
    synopsis?: string | null;
    heading?: string | null;
  } | null;
  characterNames?: string[];
  lockedFacts?: LockedFact[];
  overrides?: Record<string, string>;
  /** Explicit user direction; falls back to shot.description */
  prompt?: string | null;
  negativePrompt?: string | null;
  shotDna?: ShotDna | Record<string, unknown> | null;
}

export interface PromptLayers {
  characterDna: string;
  wardrobeDna: string;
  locationDna: string;
  visualDna: string;
}

/**
 * Build named DNA layer strings shared by story compile-preview and generation.
 */
export function buildPromptLayers(input: PromptLayerInput): PromptLayers & { layerExtras: string[] } {
  const shotDna = (input.shotDna ?? input.shot?.shotDna ?? {}) as ShotDna;
  const character = input.character;
  const location = input.location;
  const style = input.style;
  const bible = input.bible;

  const characterDna = [
    dnaSection('Character', character?.name),
    dnaSection('Bio', character?.bio),
    dnaSection('Identity', character?.identity),
    dnaSection('Body', character?.body),
    dnaSection('Acting', character?.acting),
  ]
    .filter(Boolean)
    .join(' | ');

  const wardrobeDna = dnaSection('Wardrobe', character?.wardrobe);
  const locationDna = [
    dnaSection('Location', location?.name),
    dnaSection('Description', location?.description),
    dnaSection('Location DNA', location?.dna),
  ]
    .filter(Boolean)
    .join(' | ');

  const visualDna = [
    dnaSection('Look', shotDna.look),
    dnaSection('Lighting', shotDna.lighting),
    dnaSection('Style preset', style?.dna),
    bible?.visualLanguage ? `Visual language: ${bible.visualLanguage}` : '',
  ]
    .filter(Boolean)
    .join(' | ');

  const layerExtras = [
    characterDna ? `Character DNA — ${characterDna}` : '',
    wardrobeDna ? `Wardrobe DNA — ${wardrobeDna}` : '',
    locationDna ? `Location DNA — ${locationDna}` : '',
    visualDna ? `Visual DNA — ${visualDna}` : '',
    ...Object.entries(input.overrides ?? {}).map(([k, v]) => `Override [${k}]: ${v}`),
  ].filter(Boolean);

  return { characterDna, wardrobeDna, locationDna, visualDna, layerExtras };
}

export interface ComposedShotPrompt {
  layers: PromptLayers;
  compiled: CompiledPrompt;
  lockedFacts: LockedFact[];
  userDirection: string;
}

/**
 * Compose the same prompt context used by story preview and generation normalize.
 */
export function composeShotPromptContext(input: PromptLayerInput): ComposedShotPrompt {
  const shotDna = (input.shotDna ?? input.shot?.shotDna ?? {}) as ShotDna;
  const { layerExtras, characterDna, wardrobeDna, locationDna, visualDna } =
    buildPromptLayers(input);
  const locked = input.lockedFacts ?? [];
  const userDirection =
    (input.prompt?.trim() || input.shot?.description?.trim() || '') ||
    (typeof shotDna.direction === 'string' ? shotDna.direction : '') ||
    'Generate creative output';

  const compiled = compilePrompt(
    {
      prompt: userDirection,
      negativePrompt: input.negativePrompt ?? undefined,
      shotDna,
    },
    locked,
    {
      bible: input.bible ?? undefined,
      sceneSummary: input.scene?.synopsis ?? input.scene?.heading ?? undefined,
      characterNames: input.characterNames,
      locationName: input.location?.name ?? undefined,
      extra: layerExtras,
    },
  );

  return {
    layers: { characterDna, wardrobeDna, locationDna, visualDna },
    compiled,
    lockedFacts: locked,
    userDirection,
  };
}

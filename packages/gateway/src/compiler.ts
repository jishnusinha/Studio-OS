import type { GenerationIntent, LockedFact, ShotDna, StoryBible } from '@studio-os/contracts';

export interface StoryContext {
  bible?: StoryBible | null;
  sceneSummary?: string;
  characterNames?: string[];
  locationName?: string;
  extra?: string[];
}

export interface CompiledPrompt {
  compiledPrompt: string;
  negativePrompt?: string;
  context: {
    lockedFactCount: number;
    shotDnaApplied: boolean;
    storyFragments: string[];
  };
}

function pushIf(parts: string[], label: string, value: string | undefined | null): void {
  if (value && value.trim()) {
    parts.push(`${label}: ${value.trim()}`);
  }
}

function shotDnaToProse(dna: ShotDna | undefined): string[] {
  if (!dna) return [];
  const parts: string[] = [];

  if (dna.shot?.size) parts.push(`Shot size ${dna.shot.size.replaceAll('_', ' ')}`);
  if (dna.shot?.angle) parts.push(`camera angle ${dna.shot.angle.replaceAll('_', ' ')}`);

  if (dna.camera?.format) parts.push(`captured on ${dna.camera.format}`);
  if (dna.camera?.lens) parts.push(`${dna.camera.lens} lens`);
  if (dna.camera?.aperture) parts.push(`aperture ${dna.camera.aperture}`);
  if (dna.camera?.motion?.type) {
    const intensity = dna.camera.motion.intensity
      ? ` (${dna.camera.motion.intensity})`
      : '';
    parts.push(`camera move ${dna.camera.motion.type.replaceAll('_', ' ')}${intensity}`);
  }

  if (dna.lighting?.key) parts.push(`key light ${dna.lighting.key}`);
  if (dna.lighting?.fill) parts.push(`fill ${dna.lighting.fill}`);
  if (dna.lighting?.contrast) parts.push(`${dna.lighting.contrast} contrast`);
  if (dna.lighting?.motivatedBy) parts.push(`motivated by ${dna.lighting.motivatedBy}`);

  if (dna.subject?.emotion) parts.push(`subject emotion ${dna.subject.emotion}`);
  if (dna.subject?.action) parts.push(`action: ${dna.subject.action}`);
  if (dna.subject?.costumeId) parts.push(`costume ${dna.subject.costumeId}`);

  if (dna.environment?.time) parts.push(`time of day ${dna.environment.time}`);
  if (dna.environment?.weather) parts.push(`weather ${dna.environment.weather}`);

  if (dna.look?.palette) parts.push(`palette ${dna.look.palette}`);
  if (dna.look?.grain) parts.push(`grain ${dna.look.grain}`);
  if (dna.look?.halation) parts.push(`halation ${dna.look.halation}`);
  if (dna.look?.genre) parts.push(`${dna.look.genre} genre look`);
  if (dna.look?.era) parts.push(`${dna.look.era} era`);

  if (dna.direction) parts.push(dna.direction);
  if (dna.durationSec) parts.push(`duration ${dna.durationSec}s`);
  if (dna.aspectRatio) parts.push(`aspect ratio ${dna.aspectRatio}`);

  return parts;
}

function lockedFactsToConstraints(facts: LockedFact[]): string[] {
  return facts
    .filter((f) => f.locked !== false)
    .map((f) => `CONSTRAINT [${f.entityType}/${f.key}]: ${f.value}`);
}

/**
 * Compile provider-ready prompt text from intent, locked continuity facts, and story context.
 */
export function compilePrompt(
  intent: GenerationIntent | { prompt?: string; negativePrompt?: string; shotDna?: ShotDna },
  lockedFacts: LockedFact[] = [],
  storyContext: StoryContext = {},
): CompiledPrompt {
  const storyFragments: string[] = [];
  const body: string[] = [];

  if (intent.prompt?.trim()) {
    body.push(intent.prompt.trim());
  }

  const dnaLines = shotDnaToProse(intent.shotDna);
  if (dnaLines.length > 0) {
    body.push(`Shot DNA — ${dnaLines.join('; ')}.`);
  }

  if (storyContext.bible) {
    pushIf(storyFragments, 'Premise', storyContext.bible.premise);
    pushIf(storyFragments, 'Genre', storyContext.bible.genre);
    pushIf(storyFragments, 'Tone', storyContext.bible.tone);
    pushIf(storyFragments, 'Visual language', storyContext.bible.visualLanguage);
    pushIf(storyFragments, 'Dialogue style', storyContext.bible.dialogueStyle);
    if (storyContext.bible.themes?.length) {
      storyFragments.push(`Themes: ${storyContext.bible.themes.join(', ')}`);
    }
    for (const rule of storyContext.bible.worldRules ?? []) {
      storyFragments.push(`World rule: ${rule}`);
    }
    for (const c of storyContext.bible.continuityConstraints ?? []) {
      storyFragments.push(`Continuity: ${c}`);
    }
  }

  pushIf(storyFragments, 'Scene', storyContext.sceneSummary);
  pushIf(storyFragments, 'Location', storyContext.locationName);
  if (storyContext.characterNames?.length) {
    storyFragments.push(`Characters: ${storyContext.characterNames.join(', ')}`);
  }
  for (const extra of storyContext.extra ?? []) {
    if (extra.trim()) storyFragments.push(extra.trim());
  }

  if (storyFragments.length > 0) {
    body.push(`Story context — ${storyFragments.join(' | ')}`);
  }

  const constraints = lockedFactsToConstraints(lockedFacts);
  if (constraints.length > 0) {
    body.push(`Locked facts (must honor):\n${constraints.join('\n')}`);
  }

  const compiledPrompt = body.filter(Boolean).join('\n\n').trim();
  const negativePrompt = intent.negativePrompt?.trim() || undefined;

  return {
    compiledPrompt,
    negativePrompt,
    context: {
      lockedFactCount: constraints.length,
      shotDnaApplied: dnaLines.length > 0,
      storyFragments,
    },
  };
}

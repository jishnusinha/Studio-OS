import { z } from 'zod';

/** Structured Shot DNA — provider-independent creative intent */
export const ShotDnaSchema = z.object({
  shot: z
    .object({
      size: z
        .enum([
          'extreme_wide',
          'wide',
          'medium_wide',
          'medium',
          'medium_close_up',
          'close_up',
          'extreme_close_up',
          'insert',
        ])
        .optional(),
      angle: z
        .enum(['eye_level', 'low', 'high', 'birds_eye', 'dutch', 'overhead'])
        .optional(),
    })
    .optional(),
  camera: z
    .object({
      format: z.string().optional(),
      lens: z.string().optional(),
      aperture: z.string().optional(),
      motion: z
        .object({
          type: z
            .enum([
              'static',
              'pan',
              'tilt',
              'dolly_in',
              'dolly_out',
              'truck',
              'crane',
              'handheld',
              'orbit',
              'zoom',
            ])
            .optional(),
          intensity: z.enum(['subtle', 'moderate', 'strong']).optional(),
        })
        .optional(),
    })
    .optional(),
  lighting: z
    .object({
      key: z.string().optional(),
      fill: z.string().optional(),
      contrast: z.enum(['low', 'medium', 'high']).optional(),
      motivatedBy: z.string().optional(),
    })
    .optional(),
  subject: z
    .object({
      characterId: z.string().uuid().optional(),
      costumeId: z.string().optional(),
      emotion: z.string().optional(),
      action: z.string().optional(),
    })
    .optional(),
  environment: z
    .object({
      locationId: z.string().uuid().optional(),
      time: z.string().optional(),
      weather: z.string().optional(),
    })
    .optional(),
  look: z
    .object({
      palette: z.string().optional(),
      grain: z.string().optional(),
      halation: z.string().optional(),
      genre: z.string().optional(),
      era: z.string().optional(),
    })
    .optional(),
  direction: z.string().optional(),
  durationSec: z.number().positive().optional(),
  aspectRatio: z.enum(['16:9', '9:16', '1:1', '4:5', '2.39:1']).optional(),
});
export type ShotDna = z.infer<typeof ShotDnaSchema>;

export const StoryBibleSchema = z.object({
  premise: z.string().optional(),
  genre: z.string().optional(),
  tone: z.string().optional(),
  themes: z.array(z.string()).default([]),
  visualLanguage: z.string().optional(),
  dialogueStyle: z.string().optional(),
  worldRules: z.array(z.string()).default([]),
  continuityConstraints: z.array(z.string()).default([]),
});
export type StoryBible = z.infer<typeof StoryBibleSchema>;

export const LockedFactSchema = z.object({
  id: z.string().uuid(),
  entityType: z.enum(['character', 'location', 'prop', 'costume', 'world', 'other']),
  entityId: z.string().uuid().optional(),
  key: z.string(),
  value: z.string(),
  locked: z.boolean().default(true),
  sceneRange: z.string().optional(),
});
export type LockedFact = z.infer<typeof LockedFactSchema>;

/** Structured LLM extraction payload for story bible / canon seeding */
export const StoryBibleExtractionSchema = z.object({
  logline: z.string().default(''),
  themes: z.array(z.string()).default([]),
  characters: z
    .array(
      z.object({
        name: z.string().min(1),
        description: z.string().default(''),
        traits: z.array(z.string()).default([]),
      }),
    )
    .default([]),
  locations: z.array(z.string()).default([]),
  props: z.array(z.string()).default([]),
  scenes: z
    .array(
      z.object({
        heading: z.string().min(1),
        summary: z.string().default(''),
        characters: z.array(z.string()).default([]),
      }),
    )
    .default([]),
  lockedFacts: z
    .array(
      z.object({
        key: z.string().min(1),
        value: z.string().min(1),
        entityType: z
          .enum(['character', 'location', 'prop', 'costume', 'world', 'other'])
          .optional(),
      }),
    )
    .default([]),
});
export type StoryBibleExtraction = z.infer<typeof StoryBibleExtractionSchema>;

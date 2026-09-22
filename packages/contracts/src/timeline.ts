import { z } from 'zod';
import { IdSchema } from './common.js';

export const TransformSchema = z.object({
  x: z.number().default(0),
  y: z.number().default(0),
  scaleX: z.number().default(1),
  scaleY: z.number().default(1),
  rotation: z.number().default(0),
  opacity: z.number().min(0).max(1).default(1),
});
export type Transform = z.infer<typeof TransformSchema>;

export const KeyframeSchema = z.object({
  id: z.string().uuid(),
  time: z.number().nonnegative(),
  property: z.string(),
  value: z.union([z.number(), z.string(), z.boolean()]),
  easing: z.enum(['linear', 'ease_in', 'ease_out', 'ease_in_out', 'bezier']).default('linear'),
});
export type Keyframe = z.infer<typeof KeyframeSchema>;

export const EffectSchema = z.object({
  id: z.string().uuid(),
  type: z.string(),
  enabled: z.boolean().default(true),
  parameters: z.record(z.unknown()).default({}),
});
export type Effect = z.infer<typeof EffectSchema>;

export const ClipSchema = z.object({
  id: z.string().uuid(),
  assetId: IdSchema,
  sourceIn: z.number().nonnegative(),
  sourceOut: z.number().nonnegative(),
  timelineStart: z.number().nonnegative(),
  transform: TransformSchema.default({}),
  speed: z.number().positive().default(1),
  effects: z.array(EffectSchema).default([]),
  keyframes: z.array(KeyframeSchema).default([]),
  linkedAudioClipId: z.string().uuid().nullable().optional(),
  muted: z.boolean().default(false),
  label: z.string().optional(),
});
export type Clip = z.infer<typeof ClipSchema>;

export const TrackTypeSchema = z.enum(['video', 'audio', 'title', 'effect', 'music', 'sfx']);
export type TrackType = z.infer<typeof TrackTypeSchema>;

export const TrackSchema = z.object({
  id: z.string().uuid(),
  type: TrackTypeSchema,
  name: z.string(),
  muted: z.boolean().default(false),
  locked: z.boolean().default(false),
  solo: z.boolean().default(false),
  height: z.number().int().positive().default(60),
  clips: z.array(ClipSchema).default([]),
});
export type Track = z.infer<typeof TrackSchema>;

export const TimelineSchema = z.object({
  id: z.string().uuid(),
  projectId: IdSchema,
  name: z.string(),
  fps: z.number().positive().default(24),
  width: z.number().int().positive().default(1920),
  height: z.number().int().positive().default(1080),
  duration: z.number().nonnegative().default(0),
  tracks: z.array(TrackSchema).default([]),
  markers: z
    .array(
      z.object({
        id: z.string().uuid(),
        time: z.number().nonnegative(),
        label: z.string(),
        color: z.string().optional(),
      }),
    )
    .default([]),
  version: z.number().int().nonnegative().default(1),
});
export type Timeline = z.infer<typeof TimelineSchema>;

export const TimelineCommandTypeSchema = z.enum([
  'add_clip',
  'remove_clip',
  'move_clip',
  'trim_clip',
  'blade_clip',
  'ripple_delete',
  'set_transform',
  'add_effect',
  'remove_effect',
  'add_keyframe',
  'add_marker',
  'remove_marker',
  'set_track_mute',
  'set_color_grade',
  'set_clip_audio',
  'set_multicam_angle',
  'add_mask',
  'batch',
]);
export type TimelineCommandType = z.infer<typeof TimelineCommandTypeSchema>;

export const TimelineCommandSchema = z.object({
  id: z.string().uuid(),
  type: TimelineCommandTypeSchema,
  payload: z.record(z.unknown()),
  timestamp: z.number(),
  source: z.enum(['user', 'ai', 'system']).default('user'),
});
export type TimelineCommand = z.infer<typeof TimelineCommandSchema>;

import { z } from 'zod';

/** Universal production status used across shots, assets, timelines, etc. */
export const ProductionStatusSchema = z.enum([
  'draft',
  'generating',
  'ready',
  'review',
  'changes',
  'approved',
  'locked',
  'final',
]);
export type ProductionStatus = z.infer<typeof ProductionStatusSchema>;

export const QualityModeSchema = z.enum(['draft', 'production', 'hero', 'manual']);
export type QualityMode = z.infer<typeof QualityModeSchema>;

export const ProjectRoleSchema = z.enum([
  'owner',
  'producer',
  'director',
  'writer',
  'editor',
  'vfx',
  'sound',
  'composer',
  'client',
  'reviewer',
  'viewer',
]);
export type ProjectRole = z.infer<typeof ProjectRoleSchema>;

export const AssetTypeSchema = z.enum([
  'image',
  'video',
  'audio',
  'document',
  'script',
  'timeline',
  'other',
]);
export type AssetType = z.infer<typeof AssetTypeSchema>;

export const CapabilitySchema = z.enum([
  'text.generate',
  'text.embed',
  'image.generate',
  'image.edit',
  'image.upscale',
  'video.generate',
  'video.edit',
  'video.upscale',
  'video.color_grade',
  'video.matte',
  'voice.tts',
  'voice.stt',
  'voice.clone',
  'music.generate',
  'music.midi',
  'sfx.generate',
  'audio.stem_split',
  'lip.sync',
]);
export type Capability = z.infer<typeof CapabilitySchema>;

export const PricingUnitSchema = z.enum([
  'input_token',
  'cached_token',
  'output_token',
  'image',
  'megapixel',
  'second',
  'frame',
  'audio_minute',
  'character',
  'generation',
  'gpu_second',
  'storage_gb_month',
  'egress_gb',
]);
export type PricingUnit = z.infer<typeof PricingUnitSchema>;

export const IdSchema = z.string().uuid();
export const TimestampSchema = z.coerce.date();

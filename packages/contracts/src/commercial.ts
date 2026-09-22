import { z } from 'zod';

export const BrandDnaSchema = z.object({
  logoUrl: z.string().optional(),
  colors: z.array(z.string()).default([]),
  fonts: z.array(z.string()).default([]),
  voice: z.string().optional(),
  audience: z.string().optional(),
  competitors: z.array(z.string()).default([]),
  cta: z.string().optional(),
  approvedClaims: z.array(z.string()).default([]),
  forbiddenClaims: z.array(z.string()).default([]),
  source: z.enum(['url', 'kit', 'product', 'brief']).optional(),
  sourceUrl: z.string().optional(),
  rawNotes: z.string().optional(),
});
export type BrandDna = z.infer<typeof BrandDnaSchema>;

export const BrandIngestSourceSchema = z.enum(['url', 'kit', 'product', 'brief']);
export type BrandIngestSource = z.infer<typeof BrandIngestSourceSchema>;

export const BrandIngestRequestSchema = z.object({
  source: BrandIngestSourceSchema,
  url: z.string().url().optional(),
  text: z.string().optional(),
  kit: z
    .object({
      logoUrl: z.string().optional(),
      colors: z.array(z.string()).optional(),
      fonts: z.array(z.string()).optional(),
      voice: z.string().optional(),
      audience: z.string().optional(),
      competitors: z.array(z.string()).optional(),
      cta: z.string().optional(),
      approvedClaims: z.array(z.string()).optional(),
      forbiddenClaims: z.array(z.string()).optional(),
      name: z.string().optional(),
    })
    .optional(),
  name: z.string().optional(),
});
export type BrandIngestRequest = z.infer<typeof BrandIngestRequestSchema>;

export const CampaignBeatTypeSchema = z.enum([
  'HOOK',
  'PROBLEM',
  'PRODUCT',
  'BENEFIT',
  'PROOF',
  'CTA',
]);
export type CampaignBeatType = z.infer<typeof CampaignBeatTypeSchema>;

export const BeatGrammarItemSchema = z.object({
  type: CampaignBeatTypeSchema,
  label: z.string().optional(),
  startSec: z.number().nonnegative(),
  endSec: z.number().positive(),
  locked: z.boolean().optional(),
  promptHint: z.string().optional(),
});
export type BeatGrammarItem = z.infer<typeof BeatGrammarItemSchema>;

export const CreateCampaignRequestSchema = z.object({
  templateId: z.string().uuid().optional(),
  templateSlug: z.string().optional(),
  name: z.string().min(1).optional(),
  brandId: z.string().uuid().optional(),
  productId: z.string().uuid().optional(),
  durationSec: z.number().positive().optional(),
});
export type CreateCampaignRequest = z.infer<typeof CreateCampaignRequestSchema>;

export const PatchBeatRequestSchema = z.object({
  label: z.string().optional(),
  startSec: z.number().nonnegative().optional(),
  endSec: z.number().positive().optional(),
  prompt: z.string().optional(),
  copy: z.string().optional(),
  locked: z.boolean().optional(),
  status: z.string().optional(),
  shotDna: z.record(z.unknown()).optional(),
});
export type PatchBeatRequest = z.infer<typeof PatchBeatRequestSchema>;

export const VariantFormatSchema = z.enum([
  '9:16',
  '16:9',
  '1:1',
  '4:5',
  '4:3',
]);
export type VariantFormat = z.infer<typeof VariantFormatSchema>;

export const VariantCellKeySchema = z.object({
  format: VariantFormatSchema,
  language: z.string().min(2),
  durationSec: z.number().positive(),
});
export type VariantCellKey = z.infer<typeof VariantCellKeySchema>;

export const VariantEstimateRequestSchema = z.object({
  cells: z.array(VariantCellKeySchema).min(1),
});
export type VariantEstimateRequest = z.infer<typeof VariantEstimateRequestSchema>;

export const VariantGenerateRequestSchema = z.object({
  cells: z.array(VariantCellKeySchema).min(1),
  selective: z.boolean().optional().default(true),
  /** When selective, only regenerate these beat types (default HOOK + CTA). */
  regenerateBeats: z.array(CampaignBeatTypeSchema).optional(),
  localization: z
    .object({
      dubs: z.boolean().optional(),
      captions: z.boolean().optional(),
      layout: z.boolean().optional(),
      claims: z.boolean().optional(),
    })
    .optional(),
});
export type VariantGenerateRequest = z.infer<typeof VariantGenerateRequestSchema>;

export const CreateProductRequestSchema = z.object({
  name: z.string().min(1),
  brandId: z.string().uuid().optional(),
  properties: z.record(z.unknown()).optional(),
});
export type CreateProductRequest = z.infer<typeof CreateProductRequestSchema>;

export const UpdateProductRequestSchema = z.object({
  name: z.string().min(1).optional(),
  brandId: z.string().uuid().nullable().optional(),
  properties: z.record(z.unknown()).optional(),
  status: z.string().optional(),
});
export type UpdateProductRequest = z.infer<typeof UpdateProductRequestSchema>;

export const CreatePackshotRequestSchema = z.object({
  url: z.string().optional(),
  assetId: z.string().uuid().optional(),
  label: z.string().optional(),
  sortOrder: z.number().int().optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type CreatePackshotRequest = z.infer<typeof CreatePackshotRequestSchema>;

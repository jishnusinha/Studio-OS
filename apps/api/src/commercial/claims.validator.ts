import { BadRequestException } from '@nestjs/common';
import type { BrandDna } from '@studio-os/contracts';

/** Reject prompts/copy that contain any forbidden brand claim phrases. */
export function assertNoForbiddenClaims(
  text: string | undefined | null,
  dna: BrandDna | Record<string, unknown> | null | undefined,
): void {
  if (!text?.trim() || !dna) return;
  const forbidden = Array.isArray(dna.forbiddenClaims)
    ? (dna.forbiddenClaims as unknown[]).filter((c): c is string => typeof c === 'string')
    : [];
  if (forbidden.length === 0) return;

  const haystack = text.toLowerCase();
  const hits = forbidden.filter((phrase) => {
    const p = phrase.trim().toLowerCase();
    return p.length > 0 && haystack.includes(p);
  });

  if (hits.length > 0) {
    throw new BadRequestException({
      message: 'Copy contains forbidden brand claims',
      forbiddenClaims: hits,
    });
  }
}

export function mergeBrandDna(
  existing: Record<string, unknown> | null | undefined,
  patch: Partial<BrandDna>,
): BrandDna {
  const base = (existing ?? {}) as Partial<BrandDna>;
  return {
    logoUrl: patch.logoUrl ?? base.logoUrl,
    colors: patch.colors ?? base.colors ?? [],
    fonts: patch.fonts ?? base.fonts ?? [],
    voice: patch.voice ?? base.voice,
    audience: patch.audience ?? base.audience,
    competitors: patch.competitors ?? base.competitors ?? [],
    cta: patch.cta ?? base.cta,
    approvedClaims: patch.approvedClaims ?? base.approvedClaims ?? [],
    forbiddenClaims: patch.forbiddenClaims ?? base.forbiddenClaims ?? [],
    source: patch.source ?? base.source,
    sourceUrl: patch.sourceUrl ?? base.sourceUrl,
    rawNotes: patch.rawNotes ?? base.rawNotes,
  };
}

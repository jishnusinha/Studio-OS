import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BrandIngestRequestSchema,
  type BrandDna,
} from '@studio-os/contracts';
import { brands, type Database } from '@studio-os/db';
import { desc, eq } from 'drizzle-orm';
import { DB } from '../db/db.tokens.js';
import { mergeBrandDna } from './claims.validator.js';

function hostnameFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'brand';
  }
}

function extractMeta(html: string, property: string): string | undefined {
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`,
      'i',
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`,
      'i',
    ),
  ];
  for (const re of patterns) {
    const m = re.exec(html);
    if (m?.[1]) return m[1].trim();
  }
  return undefined;
}

function extractThemeColor(html: string): string | undefined {
  return extractMeta(html, 'theme-color');
}

function titleFromHtml(html: string): string | undefined {
  const m = /<title[^>]*>([^<]+)<\/title>/i.exec(html);
  return m?.[1]?.trim();
}

function heuristicFromText(text: string, source: BrandDna['source']): Partial<BrandDna> {
  const colors = [...text.matchAll(/#([0-9a-fA-F]{3,8})\b/g)].map((m) => `#${m[1]}`);
  const competitors = [...text.matchAll(/(?:vs\.?|versus|competitor[s]?:)\s*([A-Za-z0-9 &.-]+)/gi)]
    .map((m) => m[1]?.trim())
    .filter((v): v is string => Boolean(v))
    .slice(0, 5);

  const forbidden: string[] = [];
  const approved: string[] = [];
  for (const line of text.split(/\n+/)) {
    const lower = line.toLowerCase();
    if (lower.includes('do not claim') || lower.includes('forbidden')) {
      const claim = line.split(/[:–-]/).slice(1).join(':').trim();
      if (claim) forbidden.push(claim);
    }
    if (lower.includes('approved claim') || lower.startsWith('claim:')) {
      const claim = line.split(/[:–-]/).slice(1).join(':').trim();
      if (claim) approved.push(claim);
    }
  }

  const ctaMatch =
    /(?:cta|call to action)[:\s]+["']?([^"'\n]+)["']?/i.exec(text) ??
    /\b(shop now|learn more|get started|buy now|try free)\b/i.exec(text);

  const audienceMatch = /(?:audience|for)[:\s]+([^\n.]{5,80})/i.exec(text);
  const voiceMatch = /(?:voice|tone)[:\s]+([^\n.]{5,80})/i.exec(text);

  return {
    colors: colors.length ? [...new Set(colors)].slice(0, 8) : ['#111111', '#F5F5F5', '#E11D48'],
    fonts: ['Geist Sans', 'Inter'],
    voice: voiceMatch?.[1]?.trim() ?? 'Confident, clear, benefit-led',
    audience: audienceMatch?.[1]?.trim() ?? 'Core customers discovering the product online',
    competitors,
    cta: ctaMatch?.[1]?.trim() ?? 'Shop now',
    approvedClaims: approved.length ? approved : ['Designed for everyday use'],
    forbiddenClaims: forbidden.length
      ? forbidden
      : ['cures', 'guaranteed results', 'FDA approved', 'clinically proven miracle'],
    source,
    rawNotes: text.slice(0, 2000),
  };
}

async function scrapeUrl(url: string): Promise<Partial<BrandDna> & { nameHint?: string }> {
  const host = hostnameFromUrl(url);
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'StudioOS-BrandIngest/0.1', Accept: 'text/html' },
      redirect: 'follow',
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const ogImage = extractMeta(html, 'og:image');
    const ogTitle = extractMeta(html, 'og:title') ?? titleFromHtml(html);
    const ogDesc = extractMeta(html, 'og:description') ?? extractMeta(html, 'description');
    const theme = extractThemeColor(html);
    const siteName = extractMeta(html, 'og:site_name');

    return {
      logoUrl: ogImage,
      colors: theme ? [theme, '#111111', '#FFFFFF'] : ['#0F172A', '#F8FAFC', '#E11D48'],
      fonts: ['Geist Sans'],
      voice: 'Brand-forward, concise',
      audience: ogDesc?.slice(0, 120) ?? `Visitors of ${host}`,
      competitors: [],
      cta: 'Learn more',
      approvedClaims: ogDesc ? [ogDesc.slice(0, 140)] : [`Official site: ${host}`],
      forbiddenClaims: ['guaranteed', 'miracle', 'risk-free forever'],
      source: 'url',
      sourceUrl: url,
      rawNotes: ogDesc,
      nameHint: siteName ?? ogTitle ?? host,
    };
  } catch {
    return {
      logoUrl: undefined,
      colors: ['#111827', '#F9FAFB', '#2563EB'],
      fonts: ['Geist Sans'],
      voice: 'Clean and modern',
      audience: `Audience of ${host}`,
      competitors: [],
      cta: 'Shop now',
      approvedClaims: [`Visit ${host}`],
      forbiddenClaims: ['guaranteed', 'miracle cure'],
      source: 'url',
      sourceUrl: url,
      rawNotes: `Stub DNA from hostname ${host} (fetch unavailable)`,
      nameHint: host,
    };
  }
}

@Injectable()
export class BrandService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async getBrand(projectId: string) {
    const [row] = await this.db
      .select()
      .from(brands)
      .where(eq(brands.projectId, projectId))
      .orderBy(desc(brands.updatedAt))
      .limit(1);
    return row ?? null;
  }

  async ingest(projectId: string, body: unknown) {
    const parsed = BrandIngestRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    const req = parsed.data;
    let patch: Partial<BrandDna> = {};
    let nameHint = req.name ?? req.kit?.name ?? 'Brand';

    if (req.source === 'url') {
      if (!req.url) throw new BadRequestException('url is required for source=url');
      const scraped = await scrapeUrl(req.url);
      nameHint = scraped.nameHint ?? nameHint;
      const { nameHint: _, ...rest } = scraped;
      patch = rest;
      if (req.text) {
        patch = { ...patch, ...heuristicFromText(req.text, 'url') };
      }
    } else if (req.source === 'kit') {
      const kit = req.kit ?? {};
      patch = {
        logoUrl: kit.logoUrl,
        colors: kit.colors ?? ['#111111', '#FFFFFF'],
        fonts: kit.fonts ?? ['Geist Sans'],
        voice: kit.voice ?? 'Confident',
        audience: kit.audience,
        competitors: kit.competitors ?? [],
        cta: kit.cta ?? 'Shop now',
        approvedClaims: kit.approvedClaims ?? [],
        forbiddenClaims: kit.forbiddenClaims ?? ['guaranteed results'],
        source: 'kit',
      };
      if (kit.name) nameHint = kit.name;
    } else if (req.source === 'product') {
      const text = req.text ?? 'Product-led brand DNA';
      patch = {
        ...heuristicFromText(text, 'product'),
        source: 'product',
      };
    } else {
      if (!req.text?.trim()) throw new BadRequestException('text is required for source=brief');
      patch = heuristicFromText(req.text, 'brief');
    }

    const existing = await this.getBrand(projectId);
    const dna = mergeBrandDna(existing?.dna, patch);

    if (existing) {
      const [updated] = await this.db
        .update(brands)
        .set({
          name: nameHint.slice(0, 200),
          dna,
          status: 'ready',
          version: existing.version + 1,
          updatedAt: new Date(),
        })
        .where(eq(brands.id, existing.id))
        .returning();
      return updated;
    }

    const [created] = await this.db
      .insert(brands)
      .values({
        projectId,
        name: nameHint.slice(0, 200),
        dna,
        status: 'ready',
      })
      .returning();
    if (!created) throw new BadRequestException('Failed to create brand');
    return created;
  }

  async patchDna(projectId: string, body: unknown) {
    const brand = await this.getBrand(projectId);
    if (!brand) throw new NotFoundException('Brand not found — ingest first');
    const patch = (body ?? {}) as Partial<BrandDna>;
    const dna = mergeBrandDna(brand.dna, patch);
    const [updated] = await this.db
      .update(brands)
      .set({ dna, version: brand.version + 1, updatedAt: new Date() })
      .where(eq(brands.id, brand.id))
      .returning();
    return updated;
  }
}

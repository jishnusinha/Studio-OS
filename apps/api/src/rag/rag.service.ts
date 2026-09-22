/**
 * Hierarchical RAG (Phase D1).
 *
 * Embeddings: tries local ONNX `all-MiniLM-L6-v2` (384-dim) via optional peer
 * dependency `@xenova/transformers`. When that package is not installed or fails
 * to load, falls back to a deterministic hash embedding that still produces a
 * Float32Array of length 384 — suitable for the default path / CI without ONNX.
 *
 * ONNX is optional; hash fallback is intentional and documented.
 */
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { hashString } from '@studio-os/providers';
import {
  detectFormat,
  extractDocxText,
  extractPdfText,
  parseFdx,
  parseFountain,
  parseScript,
} from '@studio-os/script-parse';
import {
  documentChunks,
  knowledgeSources,
  projects,
  type Database,
} from '@studio-os/db';
import { eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { DB } from '../db/db.tokens.js';

const EMBED_DIM = 384;

export type RagScope = 'org' | 'project' | 'sequence' | 'scene' | 'shot';

const SCOPE_RANK: Record<RagScope, number> = {
  org: 0,
  project: 1,
  sequence: 2,
  scene: 3,
  shot: 4,
};

const IngestSchema = z.object({
  title: z.string().min(1).max(500),
  content: z.string().optional(),
  contentBase64: z.string().optional(),
  filename: z.string().optional(),
  mimeType: z.string().optional(),
  sourceType: z.string().min(1).max(40).default('document'),
  scope: z.enum(['org', 'project', 'sequence', 'scene', 'shot']).default('project'),
  scopeRefId: z.string().uuid().optional().nullable(),
  organizationId: z.string().uuid().optional().nullable(),
  metadata: z.record(z.unknown()).optional(),
});

const QuerySchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().positive().max(50).optional(),
  /** Maximum scope depth allowed into the prompt (wrong scope never enters). */
  scope: z.enum(['org', 'project', 'sequence', 'scene', 'shot']).optional(),
  scopeRefId: z.string().uuid().optional().nullable(),
  sequenceId: z.string().uuid().optional(),
  sceneId: z.string().uuid().optional(),
  shotId: z.string().uuid().optional(),
});

function seededUnitFloat(seed: number, index: number): number {
  let x = (seed ^ Math.imul(index + 1, 0x9e3779b9)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  x ^= x >>> 16;
  return (x >>> 0) / 0xffffffff;
}

/** Escape `%`, `_`, and `\` for safe PostgreSQL ILIKE patterns. */
export function escapeIlike(raw: string): string {
  return raw.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

/** Deterministic hash embed → Float32Array length 384 (default when ONNX missing). */
export function hashEmbed(text: string, seed = 0): Float32Array {
  const textHash = hashString(text);
  const combined = (seed ^ textHash) >>> 0;
  const values = new Float32Array(EMBED_DIM);
  let norm = 0;
  for (let i = 0; i < EMBED_DIM; i++) {
    const v = seededUnitFloat(combined, i) * 2 - 1;
    values[i] = v;
    norm += v * v;
  }
  const scale = norm > 0 ? 1 / Math.sqrt(norm) : 1;
  for (let i = 0; i < EMBED_DIM; i++) values[i]! *= scale;
  return values;
}

/** @deprecated alias — prefer hashEmbed / embedText */
export function deterministicEmbed(text: string, seed = 0): number[] {
  return Array.from(hashEmbed(text, seed));
}

type PipelineFn = (
  text: string,
  opts?: { pooling?: string; normalize?: boolean },
) => Promise<{ data: Float32Array | number[] }>;

let onnxPipeline: PipelineFn | null | undefined;
let onnxLoadAttempted = false;

async function loadOnnxPipeline(): Promise<PipelineFn | null> {
  if (onnxLoadAttempted) return onnxPipeline ?? null;
  onnxLoadAttempted = true;
  try {
    // Optional dependency — may be absent in default installs.
    const mod = await import('@xenova/transformers');
    const pipe = (await mod.pipeline(
      'feature-extraction',
      'Xenova/all-MiniLM-L6-v2',
    )) as PipelineFn;
    onnxPipeline = pipe;
    return pipe;
  } catch {
    onnxPipeline = null;
    return null;
  }
}

export async function embedText(text: string): Promise<Float32Array> {
  const pipe = await loadOnnxPipeline();
  if (pipe) {
    try {
      const out = await pipe(text.slice(0, 8000), { pooling: 'mean', normalize: true });
      const data = out.data;
      const arr = data instanceof Float32Array ? data : Float32Array.from(data);
      if (arr.length >= EMBED_DIM) return arr.slice(0, EMBED_DIM);
      const padded = new Float32Array(EMBED_DIM);
      padded.set(arr);
      return padded;
    } catch {
      // fall through to hash
    }
  }
  return hashEmbed(text);
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractEpubText(buffer: Buffer): string {
  // Minimal EPUB: unzip-like scan for HTML/XHTML payloads without requiring JSZip.
  const asLatin = buffer.toString('latin1');
  const htmlChunks: string[] = [];
  const re = /\.x?html?/gi;
  // Prefer UTF-8 decode of whole buffer when it looks like plain/xml
  if (/<\?xml|<html|<body/i.test(buffer.toString('utf8').slice(0, 500))) {
    return stripHtml(buffer.toString('utf8'));
  }
  // Fallback: pull printable runs that look like markup from the zip payload
  const utf8 = buffer.toString('utf8');
  const tags = utf8.match(/<(?:p|h[1-6]|div|span|section)[^>]*>[\s\S]*?<\/(?:p|h[1-6]|div|span|section)>/gi);
  if (tags?.length) {
    return stripHtml(tags.join('\n'));
  }
  void re;
  void asLatin;
  void htmlChunks;
  return stripHtml(utf8.replace(/[^\x09\x0A\x0D\x20-\x7E]/g, ' '));
}

export interface ParsedDocument {
  text: string;
  scenes: Array<{ heading: string; summary: string; index: number }>;
  format: string;
  title?: string;
}

export function parseDocument(input: {
  content?: string;
  buffer?: Buffer;
  filename?: string;
  mimeType?: string;
}): ParsedDocument {
  const filename = input.filename?.toLowerCase() ?? '';
  const mime = input.mimeType?.toLowerCase() ?? '';

  if (filename.endsWith('.epub') || mime.includes('epub')) {
    const buf = input.buffer ?? Buffer.from(input.content ?? '', 'utf8');
    const text = extractEpubText(buf);
    return { text, scenes: [], format: 'epub', title: input.filename };
  }

  if (
    filename.endsWith('.html') ||
    filename.endsWith('.htm') ||
    mime.includes('text/html')
  ) {
    const raw = input.content ?? input.buffer?.toString('utf8') ?? '';
    const text = stripHtml(raw);
    return { text, scenes: [], format: 'html', title: input.filename };
  }

  const format = detectFormat(input.filename, input.mimeType, input.buffer ?? input.content);
  if (format === 'pdf' && input.buffer) {
    const text = extractPdfText(input.buffer) || input.buffer.toString('utf8');
    const parsed = parseFountain(text);
    return {
      text: parsed.text || text,
      scenes: parsed.scenes.map((s, i) => ({ heading: s.heading, summary: s.summary, index: i + 1 })),
      format: 'pdf',
      title: parsed.title ?? input.filename,
    };
  }
  if (format === 'docx' && input.buffer) {
    const text = extractDocxText(input.buffer) || input.buffer.toString('utf8');
    const parsed = parseFountain(text);
    return {
      text: parsed.text || text,
      scenes: parsed.scenes.map((s, i) => ({ heading: s.heading, summary: s.summary, index: i + 1 })),
      format: 'docx',
      title: parsed.title ?? input.filename,
    };
  }
  if (format === 'fdx') {
    const raw = input.content ?? input.buffer?.toString('utf8') ?? '';
    const parsed = parseFdx(raw);
    return {
      text: parsed.text,
      scenes: parsed.scenes.map((s, i) => ({ heading: s.heading, summary: s.summary, index: i + 1 })),
      format: 'fdx',
      title: parsed.title ?? input.filename,
    };
  }

  const parsed = parseScript({
    content: input.content,
    buffer: input.buffer,
    filename: input.filename,
    mimeType: input.mimeType,
  });
  return {
    text: parsed.text,
    scenes: parsed.scenes.map((s, i) => ({ heading: s.heading, summary: s.summary, index: i + 1 })),
    format: parsed.format,
    title: parsed.title ?? input.filename,
  };
}

function chunkText(content: string, size = 500): string[] {
  const parts: string[] = [];
  const paragraphs = content.split(/\n{2,}/);
  let buf = '';
  for (const p of paragraphs) {
    if ((buf + '\n\n' + p).length > size && buf) {
      parts.push(buf.trim());
      buf = p;
    } else {
      buf = buf ? `${buf}\n\n${p}` : p;
    }
  }
  if (buf.trim()) parts.push(buf.trim());
  if (parts.length === 0 && content) parts.push(content.slice(0, size));
  return parts;
}

function buildCitation(
  title: string,
  sceneNumber?: number | null,
  chunkIndex?: number,
): string {
  if (sceneNumber != null && sceneNumber > 0) {
    return `${title} → Scene ${sceneNumber}`;
  }
  if (chunkIndex != null) {
    return `${title}#${chunkIndex + 1}`;
  }
  return title;
}

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/i)
      .filter((t) => t.length > 2),
  );
}

function tokenOverlapScore(query: string, content: string): number {
  const q = tokenize(query);
  const c = tokenize(content);
  if (q.size === 0) return 0;
  let hit = 0;
  for (const t of q) if (c.has(t)) hit++;
  return hit / q.size;
}

/** Reciprocal Rank Fusion over ranked id lists. */
export function reciprocalRankFusion(
  rankedLists: string[][],
  k = 60,
): Map<string, number> {
  const scores = new Map<string, number>();
  for (const list of rankedLists) {
    list.forEach((id, rank) => {
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + rank + 1));
    });
  }
  return scores;
}

function vectorLiteral(embedding: Float32Array | number[]): string {
  const arr = embedding instanceof Float32Array ? Array.from(embedding) : embedding;
  return `[${arr.join(',')}]`;
}

function scopeAllowed(
  chunkScope: string,
  chunkMeta: Record<string, unknown>,
  filter: {
    scope?: RagScope;
    scopeRefId?: string | null;
    sequenceId?: string;
    sceneId?: string;
    shotId?: string;
  },
): boolean {
  const maxScope = filter.scope ?? 'project';
  const chunkRank = SCOPE_RANK[chunkScope as RagScope] ?? SCOPE_RANK.project;
  const maxRank = SCOPE_RANK[maxScope];

  // Chunks deeper than requested context must not enter the prompt.
  if (chunkRank > maxRank) return false;

  if (filter.shotId && chunkScope === 'shot') {
    return chunkMeta.shotId === filter.shotId || filter.scopeRefId === filter.shotId;
  }
  if (filter.sceneId && (chunkScope === 'scene' || chunkScope === 'shot')) {
    if (chunkScope === 'scene') {
      return (
        chunkMeta.sceneId === filter.sceneId ||
        filter.scopeRefId === filter.sceneId ||
        !chunkMeta.sceneId
      );
    }
    // shot-scoped chunks under a different scene are excluded
    if (chunkMeta.sceneId && chunkMeta.sceneId !== filter.sceneId) return false;
  }
  if (filter.sequenceId && chunkRank >= SCOPE_RANK.sequence) {
    if (chunkMeta.sequenceId && chunkMeta.sequenceId !== filter.sequenceId) return false;
  }
  if (filter.scopeRefId && chunkRank === maxRank) {
    const ref =
      (chunkMeta.scopeRefId as string | undefined) ??
      (chunkMeta[`${chunkScope}Id`] as string | undefined);
    if (ref && ref !== filter.scopeRefId) return false;
  }
  return true;
}

@Injectable()
export class RagService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async ingest(projectId: string, body: unknown) {
    const parsed = IngestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());

    const [project] = await this.db
      .select({ id: projects.id, workspaceId: projects.workspaceId })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    if (!project) throw new NotFoundException('Project not found');

    const data = parsed.data;
    const buffer = data.contentBase64
      ? Buffer.from(data.contentBase64, 'base64')
      : data.content
        ? Buffer.from(data.content, 'utf8')
        : undefined;

    if (!data.content && !buffer) {
      throw new BadRequestException('content or contentBase64 required');
    }

    const doc = parseDocument({
      content: data.content,
      buffer,
      filename: data.filename ?? data.title,
      mimeType: data.mimeType,
    });

    const title = data.title || doc.title || 'Untitled';
    const sourceType = data.sourceType || doc.format || 'document';

    const [source] = await this.db
      .insert(knowledgeSources)
      .values({
        projectId,
        organizationId: data.organizationId ?? null,
        title,
        sourceType,
        scope: data.scope,
        scopeRefId: data.scopeRefId ?? null,
        status: 'ready',
        metadata: {
          ...(data.metadata ?? {}),
          format: doc.format,
          filename: data.filename,
        },
      })
      .returning();

    if (!source) throw new BadRequestException('Failed to create knowledge source');

    const inserted: Array<{ id: string; chunkIndex: number; citation: string | null }> = [];

    if (doc.scenes.length > 0 && (doc.format === 'fdx' || doc.format === 'fountain' || doc.format === 'pdf' || doc.format === 'docx')) {
      for (const scene of doc.scenes) {
        const content = `${scene.heading}\n\n${scene.summary}`.trim();
        if (!content) continue;
        const embedding = await embedText(content);
        const citation = buildCitation(title, scene.index);
        const [row] = await this.db
          .insert(documentChunks)
          .values({
            sourceId: source.id,
            chunkIndex: scene.index - 1,
            content,
            citation,
            embedding: Array.from(embedding),
            metadata: {
              title,
              scope: data.scope,
              scopeRefId: data.scopeRefId,
              sceneNumber: scene.index,
              sceneHeading: scene.heading,
              format: doc.format,
            },
          })
          .returning({
            id: documentChunks.id,
            chunkIndex: documentChunks.chunkIndex,
            citation: documentChunks.citation,
          });
        if (row) inserted.push(row);
      }
    } else {
      const chunks = chunkText(doc.text);
      for (let i = 0; i < chunks.length; i++) {
        const content = chunks[i]!;
        const embedding = await embedText(content);
        const citation = buildCitation(title, null, i);
        const [row] = await this.db
          .insert(documentChunks)
          .values({
            sourceId: source.id,
            chunkIndex: i,
            content,
            citation,
            embedding: Array.from(embedding),
            metadata: {
              title,
              scope: data.scope,
              scopeRefId: data.scopeRefId,
              format: doc.format,
            },
          })
          .returning({
            id: documentChunks.id,
            chunkIndex: documentChunks.chunkIndex,
            citation: documentChunks.citation,
          });
        if (row) inserted.push(row);
      }
    }

    return {
      source,
      chunks: inserted,
      embedder: onnxPipeline ? 'onnx:all-MiniLM-L6-v2' : 'hash-fallback',
    };
  }

  async query(projectId: string, body: unknown) {
    const parsed = QuerySchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());

    const limit = parsed.data.limit ?? 8;
    const queryText = parsed.data.query;

    const sources = await this.db
      .select({
        id: knowledgeSources.id,
        title: knowledgeSources.title,
        scope: knowledgeSources.scope,
        scopeRefId: knowledgeSources.scopeRefId,
        metadata: knowledgeSources.metadata,
      })
      .from(knowledgeSources)
      .where(eq(knowledgeSources.projectId, projectId));

    if (sources.length === 0) {
      return { query: queryText, citations: [], chunks: [], embedder: onnxPipeline ? 'onnx' : 'hash' };
    }

    const sourceIds = sources.map((s) => s.id);
    const sourceById = new Map(sources.map((s) => [s.id, s]));

    const queryEmbed = await embedText(queryText);
    const vec = vectorLiteral(queryEmbed);
    const escaped = escapeIlike(queryText.slice(0, 200));

    type ChunkRow = {
      id: string;
      source_id: string;
      content: string;
      citation: string | null;
      chunk_index: number;
      metadata: Record<string, unknown>;
      distance?: number;
    };

    const asRows = (result: unknown): ChunkRow[] => {
      if (Array.isArray(result)) return result as ChunkRow[];
      if (result && typeof result === 'object' && 'rows' in result) {
        return (result as { rows: ChunkRow[] }).rows ?? [];
      }
      return [];
    };

    // Vector ANN (cosine distance via pgvector) — uses HNSW when present
    const vectorList = asRows(
      await this.db.execute(sql`
        SELECT
          dc.id,
          dc.source_id,
          dc.content,
          dc.citation,
          dc.chunk_index,
          dc.metadata,
          (dc.embedding <=> ${vec}::vector) AS distance
        FROM document_chunks dc
        WHERE dc.source_id IN (${sql.join(
          sourceIds.map((id) => sql`${id}::uuid`),
          sql`, `,
        )})
          AND dc.embedding IS NOT NULL
        ORDER BY dc.embedding <=> ${vec}::vector
        LIMIT ${limit * 3}
      `),
    );

    // Lexical: tsvector + escaped ILIKE (injection-safe; % _ \ escaped)
    const lexicalList = asRows(
      await this.db.execute(sql`
        SELECT
          dc.id,
          dc.source_id,
          dc.content,
          dc.citation,
          dc.chunk_index,
          dc.metadata
        FROM document_chunks dc
        WHERE dc.source_id IN (${sql.join(
          sourceIds.map((id) => sql`${id}::uuid`),
          sql`, `,
        )})
          AND (
            to_tsvector('english', dc.content) @@ plainto_tsquery('english', ${queryText})
            OR dc.content ILIKE ${'%' + escaped + '%'} ESCAPE E'\\'
          )
        LIMIT ${limit * 3}
      `),
    );

    const byId = new Map<
      string,
      {
        id: string;
        sourceId: string;
        content: string;
        citation: string | null;
        chunkIndex: number;
        metadata: Record<string, unknown>;
        vectorDistance?: number;
      }
    >();

    for (const r of vectorList) {
      byId.set(r.id, {
        id: r.id,
        sourceId: r.source_id,
        content: r.content,
        citation: r.citation,
        chunkIndex: r.chunk_index,
        metadata: (r.metadata ?? {}) as Record<string, unknown>,
        vectorDistance: Number(r.distance),
      });
    }
    for (const r of lexicalList) {
      if (!byId.has(r.id)) {
        byId.set(r.id, {
          id: r.id,
          sourceId: r.source_id,
          content: r.content,
          citation: r.citation,
          chunkIndex: r.chunk_index,
          metadata: (r.metadata ?? {}) as Record<string, unknown>,
        });
      }
    }

    const rrf = reciprocalRankFusion([
      vectorList.map((r) => r.id),
      lexicalList.map((r) => r.id),
    ]);

    const scopeFilter = {
      scope: parsed.data.scope,
      scopeRefId: parsed.data.scopeRefId,
      sequenceId: parsed.data.sequenceId,
      sceneId: parsed.data.sceneId,
      shotId: parsed.data.shotId,
    };

    const scored = [...byId.values()]
      .filter((chunk) => {
        const source = sourceById.get(chunk.sourceId);
        const chunkScope = String(chunk.metadata.scope ?? source?.scope ?? 'project');
        const meta = {
          ...((source?.metadata as Record<string, unknown>) ?? {}),
          ...chunk.metadata,
          scopeRefId: source?.scopeRefId ?? chunk.metadata.scopeRefId,
          sceneId: chunk.metadata.sceneId,
          sequenceId: chunk.metadata.sequenceId,
          shotId: chunk.metadata.shotId,
        };
        return scopeAllowed(chunkScope, meta, scopeFilter);
      })
      .map((chunk) => {
        const rrfScore = rrf.get(chunk.id) ?? 0;
        const overlap = tokenOverlapScore(queryText, chunk.content);
        const vecScore =
          chunk.vectorDistance != null ? 1 / (1 + chunk.vectorDistance) : 0;
        // Simple reranker: RRF + token overlap + vector similarity
        const score = rrfScore * 2 + overlap * 0.5 + vecScore * 0.3;
        const source = sourceById.get(chunk.sourceId);
        const title = source?.title ?? String(chunk.metadata.title ?? 'Untitled');
        const sceneNumber = chunk.metadata.sceneNumber as number | undefined;
        const citation =
          chunk.citation ??
          buildCitation(title, sceneNumber ?? null, chunk.chunkIndex);
        return {
          ...chunk,
          title,
          citation,
          score,
          rrfScore,
          overlap,
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    // Fallback if hybrid + scope filtered everything — still respect scope
    let results = scored;
    if (results.length === 0) {
      const fallback = await this.db
        .select({
          id: documentChunks.id,
          sourceId: documentChunks.sourceId,
          content: documentChunks.content,
          citation: documentChunks.citation,
          chunkIndex: documentChunks.chunkIndex,
          metadata: documentChunks.metadata,
        })
        .from(documentChunks)
        .where(inArray(documentChunks.sourceId, sourceIds))
        .limit(limit * 2);

      results = fallback
        .filter((chunk) => {
          const source = sourceById.get(chunk.sourceId);
          const chunkScope = String(
            (chunk.metadata as Record<string, unknown>)?.scope ?? source?.scope ?? 'project',
          );
          return scopeAllowed(
            chunkScope,
            {
              ...((source?.metadata as Record<string, unknown>) ?? {}),
              ...((chunk.metadata as Record<string, unknown>) ?? {}),
            },
            scopeFilter,
          );
        })
        .slice(0, limit)
        .map((chunk) => {
          const source = sourceById.get(chunk.sourceId);
          const title = source?.title ?? 'Untitled';
          const meta = (chunk.metadata ?? {}) as Record<string, unknown>;
          return {
            ...chunk,
            title,
            citation:
              chunk.citation ??
              buildCitation(title, (meta.sceneNumber as number) ?? null, chunk.chunkIndex),
            score: 0.1,
            rrfScore: 0,
            overlap: 0,
          };
        });
    }

    return {
      query: queryText,
      embedder: onnxPipeline ? 'onnx:all-MiniLM-L6-v2' : 'hash-fallback',
      chunks: results.map((c) => ({
        id: c.id,
        sourceId: c.sourceId,
        content: c.content,
        citation: c.citation,
        chunkIndex: c.chunkIndex,
        title: c.title,
        score: c.score,
      })),
      citations: results.map((c) => ({
        citation: c.citation,
        title: c.title,
        excerpt: c.content.slice(0, 240),
        score: c.score,
      })),
    };
  }
}

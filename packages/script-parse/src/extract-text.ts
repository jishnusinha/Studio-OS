import { detectFormat } from './detect.js';
import { extractDocxText } from './docx.js';
import { parseFdx } from './fdx.js';
import { parseFountain } from './fountain.js';
import { extractPdfText } from './pdf.js';
import type { ParsedScript, ScriptFormat } from './types.js';

export interface ParseScriptInput {
  content?: string;
  buffer?: Buffer;
  filename?: string;
  mimeType?: string;
  format?: ScriptFormat;
}

/**
 * Parse a screenplay from text or binary buffer into structured scenes/characters.
 */
export function parseScript(input: ParseScriptInput): ParsedScript {
  const format =
    input.format && input.format !== 'unknown'
      ? input.format
      : detectFormat(input.filename, input.mimeType, input.buffer ?? input.content);

  if (format === 'fdx') {
    const raw = input.content ?? input.buffer?.toString('utf8') ?? '';
    return parseFdx(raw);
  }

  if (format === 'pdf') {
    const buf =
      input.buffer ??
      (input.content ? Buffer.from(input.content, 'utf8') : Buffer.alloc(0));
    const text = extractPdfText(buf) || buf.toString('utf8');
    const parsed = parseFountain(text);
    return { ...parsed, format: 'pdf', text };
  }

  if (format === 'docx') {
    const buf =
      input.buffer ??
      (input.content ? Buffer.from(input.content, 'base64') : Buffer.alloc(0));
    const text = extractDocxText(buf) || buf.toString('utf8');
    const parsed = parseFountain(text);
    return { ...parsed, format: 'docx', text };
  }

  const text = input.content ?? input.buffer?.toString('utf8') ?? '';
  const parsed = parseFountain(text);
  return {
    ...parsed,
    format: format === 'txt' ? 'txt' : parsed.format,
  };
}

export function toExtractionSeed(parsed: ParsedScript): {
  logline: string;
  themes: string[];
  characters: Array<{ name: string; description: string; traits: string[] }>;
  locations: string[];
  props: string[];
  scenes: Array<{ heading: string; summary: string; characters: string[] }>;
  lockedFacts: Array<{ key: string; value: string }>;
} {
  const logline =
    parsed.title ??
    parsed.scenes[0]?.summary?.slice(0, 200) ??
    parsed.text.slice(0, 200);

  return {
    logline,
    themes: [],
    characters: parsed.characters.map((name) => ({
      name,
      description: '',
      traits: [],
    })),
    locations: parsed.locations,
    props: [],
    scenes: parsed.scenes.map((s) => ({
      heading: s.heading,
      summary: s.summary,
      characters: s.characters,
    })),
    lockedFacts: [],
  };
}

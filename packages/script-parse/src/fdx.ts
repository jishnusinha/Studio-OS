import { parseFountain } from './fountain.js';
import type { ParsedScript } from './types.js';

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCharCode(parseInt(n, 16)));
}

function extractText(el: string): string {
  return decodeXmlEntities(el.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

/**
 * Basic Final Draft XML (.fdx) parse — extracts Paragraph Type + Text into Fountain-ish text,
 * then reuses the Fountain scene/character heuristics.
 */
export function parseFdx(input: string | Buffer): ParsedScript {
  const xml = typeof input === 'string' ? input : input.toString('utf8');
  const paragraphs: string[] = [];

  const paraRe =
    /<Paragraph\b([^>]*)>([\s\S]*?)<\/Paragraph>/gi;
  let m: RegExpExecArray | null;
  while ((m = paraRe.exec(xml)) !== null) {
    const attrs = m[1] ?? '';
    const body = m[2] ?? '';
    const typeMatch = /Type="([^"]+)"/i.exec(attrs);
    const type = (typeMatch?.[1] ?? '').toLowerCase();
    const text = extractText(body);
    if (!text) continue;

    if (type === 'scenheading' || type === 'scene heading') {
      paragraphs.push(text.toUpperCase());
    } else if (type === 'character') {
      paragraphs.push(text.toUpperCase());
    } else if (type === 'dialogue' || type === 'action' || type === 'parenthetical') {
      paragraphs.push(type === 'parenthetical' ? `(${text})` : text);
    } else {
      paragraphs.push(text);
    }
    paragraphs.push('');
  }

  const titleMatch = /<TitlePage[\s\S]*?<Text[^>]*>([\s\S]*?)<\/Text>/i.exec(xml);
  const title = titleMatch ? extractText(titleMatch[1] ?? '') : undefined;

  const fountainText = paragraphs.join('\n');
  const parsed = parseFountain(fountainText || xml.replace(/<[^>]+>/g, ' '));
  return {
    ...parsed,
    format: 'fdx',
    title: title || parsed.title,
    text: fountainText || parsed.text,
  };
}

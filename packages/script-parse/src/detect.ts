import type { ScriptFormat } from './types.js';

export function detectFormat(
  filename?: string,
  mimeType?: string,
  sample?: string | Buffer,
): ScriptFormat {
  const name = (filename ?? '').toLowerCase();
  const mime = (mimeType ?? '').toLowerCase();

  if (name.endsWith('.fountain') || name.endsWith('.spmd')) return 'fountain';
  if (name.endsWith('.fdx')) return 'fdx';
  if (name.endsWith('.pdf') || mime.includes('pdf')) return 'pdf';
  if (name.endsWith('.docx') || mime.includes('wordprocessingml')) return 'docx';
  if (name.endsWith('.txt') || mime.startsWith('text/')) return 'txt';

  if (sample) {
    const head =
      typeof sample === 'string'
        ? sample.slice(0, 200)
        : sample.subarray(0, Math.min(200, sample.length)).toString('utf8');
    if (head.startsWith('%PDF')) return 'pdf';
    if (head.startsWith('PK')) return 'docx';
    if (/<FinalDraft\b/i.test(head) || /<Paragraph\b/i.test(head)) return 'fdx';
    if (/^(INT|EXT|Title:)\b/im.test(head)) return 'fountain';
  }

  return 'unknown';
}

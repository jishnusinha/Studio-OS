/**
 * Lightweight PDF text extraction without native deps.
 * Prefer streams / BT…ET content; fall back to printable ASCII runs.
 * TODO: swap for pdf-parse / pdfjs when heavier accuracy is needed.
 */
export function extractPdfText(buffer: Buffer): string {
  const raw = buffer.toString('latin1');

  const streamChunks: string[] = [];
  const streamRe = /stream\r?\n([\s\S]*?)endstream/g;
  let m: RegExpExecArray | null;
  while ((m = streamRe.exec(raw)) !== null) {
    const chunk = m[1] ?? '';
    // Try literal string objects inside content streams: (text)
    const litRe = /\((?:\\.|[^\\)])*\)/g;
    let lit: RegExpExecArray | null;
    while ((lit = litRe.exec(chunk)) !== null) {
      const inner = lit[0].slice(1, -1)
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '')
        .replace(/\\t/g, '\t')
        .replace(/\\\(/g, '(')
        .replace(/\\\)/g, ')')
        .replace(/\\\\/g, '\\');
      if (inner.trim()) streamChunks.push(inner);
    }
    // Tj / TJ operators with hex strings <...>
    const hexRe = /<([0-9A-Fa-f\s]+)>/g;
    let hx: RegExpExecArray | null;
    while ((hx = hexRe.exec(chunk)) !== null) {
      const hex = (hx[1] ?? '').replace(/\s+/g, '');
      if (hex.length < 2 || hex.length % 2 !== 0) continue;
      const bytes: number[] = [];
      for (let i = 0; i < hex.length; i += 2) {
        bytes.push(parseInt(hex.slice(i, i + 2), 16));
      }
      const decoded = Buffer.from(bytes).toString('utf8').replace(/[^\x20-\x7E\n\r\t]/g, '');
      if (decoded.trim()) streamChunks.push(decoded);
    }
  }

  if (streamChunks.length > 0) {
    return streamChunks.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  // Heuristic: long printable runs from the whole file
  const runs = raw.match(/[\x20-\x7E]{5,}/g) ?? [];
  const filtered = runs.filter(
    (r) =>
      !/^(obj|endobj|stream|endstream|xref|trailer|startxref)/i.test(r) &&
      !/^%PDF/i.test(r),
  );
  return filtered.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

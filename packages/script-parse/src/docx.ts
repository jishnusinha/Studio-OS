import { inflateRawSync, inflateSync } from 'node:zlib';

interface ZipEntry {
  name: string;
  compression: number;
  compressed: Buffer;
}

/**
 * Minimal ZIP reader for DOCX (PKZIP local file headers).
 * Supports stored (0) and deflate (8) entries only.
 */
function readZipEntries(buffer: Buffer): ZipEntry[] {
  const entries: ZipEntry[] = [];
  let offset = 0;
  while (offset + 30 <= buffer.length) {
    if (buffer.readUInt32LE(offset) !== 0x04034b50) break;
    const compression = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const nameLen = buffer.readUInt16LE(offset + 26);
    const extraLen = buffer.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const name = buffer.subarray(nameStart, nameStart + nameLen).toString('utf8');
    const dataStart = nameStart + nameLen + extraLen;
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
    entries.push({ name, compression, compressed: Buffer.from(compressed) });
    offset = dataStart + compressedSize;
  }
  return entries;
}

function inflateEntry(entry: ZipEntry): Buffer {
  if (entry.compression === 0) return entry.compressed;
  if (entry.compression === 8) {
    try {
      return inflateRawSync(entry.compressed);
    } catch {
      return inflateSync(entry.compressed);
    }
  }
  throw new Error(`Unsupported ZIP compression method: ${entry.compression}`);
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)));
}

/**
 * Extract plain text from DOCX by reading word/document.xml.
 * TODO: preserve paragraph styles / screenplay formatting more accurately.
 */
export function extractDocxText(buffer: Buffer): string {
  try {
    const entries = readZipEntries(buffer);
    const doc = entries.find((e) => e.name === 'word/document.xml');
    if (!doc) {
      // Fallback: utf8 scrape
      return buffer.toString('utf8').replace(/[^\x09\x0A\x0D\x20-\x7E]/g, ' ').trim();
    }
    const xml = inflateEntry(doc).toString('utf8');
    const parts: string[] = [];
    const re = /<w:t[^>]*>([\s\S]*?)<\/w:t>|<w:tab\/>|<w:br\/>|<\/w:p>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml)) !== null) {
      if (m[0] === '</w:p>' || m[0] === '<w:br/>') {
        parts.push('\n');
      } else if (m[0] === '<w:tab/>') {
        parts.push('\t');
      } else if (m[1] !== undefined) {
        parts.push(decodeXmlEntities(m[1]));
      }
    }
    return parts.join('').replace(/\n{3,}/g, '\n\n').trim();
  } catch {
    // TODO: if ZIP inflate fails, still return something usable
    return buffer.toString('utf8').replace(/[^\x09\x0A\x0D\x20-\x7E]/g, ' ').trim();
  }
}

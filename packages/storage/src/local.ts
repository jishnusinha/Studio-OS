import { createHmac, timingSafeEqual } from 'node:crypto';
import { createReadStream, createWriteStream, promises as fs } from 'node:fs';
import { dirname, join, normalize, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { PresignGetResult, PresignPutResult, StorageBackend, StorageHead } from './types.js';

export interface LocalFsStorageConfig {
  rootDir: string;
  /** Base API URL used to mint upload/download URLs, e.g. http://localhost:4000 */
  apiPublicUrl: string;
  /** Shared secret for signing local media tokens (defaults to a derived string). */
  signingSecret: string;
}

function encodeKey(key: string): string {
  return Buffer.from(key, 'utf8').toString('base64url');
}

function decodeKey(encoded: string): string {
  return Buffer.from(encoded, 'base64url').toString('utf8');
}

export class LocalFsStorageBackend implements StorageBackend {
  readonly kind = 'local' as const;
  private readonly root: string;

  constructor(private readonly config: LocalFsStorageConfig) {
    this.root = resolve(config.rootDir);
  }

  localPath(key: string): string {
    const safe = normalize(key).replace(/^(\.\.(\/|\\|$))+/, '');
    const full = resolve(join(this.root, safe));
    if (!full.startsWith(this.root + sep) && full !== this.root) {
      throw new Error(`Path escape blocked for key ${key}`);
    }
    return full;
  }

  async put(key: string, body: Buffer | Uint8Array, _contentType?: string): Promise<void> {
    const path = this.localPath(key);
    await fs.mkdir(dirname(path), { recursive: true });
    await fs.writeFile(path, body);
  }

  async getBuffer(key: string): Promise<Buffer> {
    return fs.readFile(this.localPath(key));
  }

  async getStream(key: string): Promise<Readable> {
    return createReadStream(this.localPath(key));
  }

  async head(key: string): Promise<StorageHead> {
    try {
      const st = await fs.stat(this.localPath(key));
      return { key, exists: true, sizeBytes: st.size };
    } catch {
      return { key, exists: false, sizeBytes: 0 };
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await fs.unlink(this.localPath(key));
    } catch {
      /* ignore */
    }
  }

  async materialize(key: string, destPath: string): Promise<string> {
    const src = this.localPath(key);
    if (resolve(src) === resolve(destPath)) return src;
    await fs.mkdir(dirname(destPath), { recursive: true });
    await pipeline(createReadStream(src), createWriteStream(destPath));
    return destPath;
  }

  signToken(key: string, expiresAtMs: number): string {
    const payload = `${encodeKey(key)}.${expiresAtMs}`;
    const sig = createHmac('sha256', this.config.signingSecret).update(payload).digest('base64url');
    return `${payload}.${sig}`;
  }

  verifyToken(token: string): { key: string; expiresAtMs: number } | null {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [encKey, expStr, sig] = parts as [string, string, string];
    const payload = `${encKey}.${expStr}`;
    const expected = createHmac('sha256', this.config.signingSecret).update(payload).digest('base64url');
    try {
      const a = Buffer.from(sig);
      const b = Buffer.from(expected);
      if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    } catch {
      return null;
    }
    const expiresAtMs = Number(expStr);
    if (!Number.isFinite(expiresAtMs) || Date.now() > expiresAtMs) return null;
    return { key: decodeKey(encKey), expiresAtMs };
  }

  async presignPut(
    key: string,
    contentType: string,
    sizeBytes: number,
    expiresInSec = 3600,
  ): Promise<PresignPutResult> {
    const expiresAt = new Date(Date.now() + expiresInSec * 1000);
    const token = this.signToken(key, expiresAt.getTime());
    const base = this.config.apiPublicUrl.replace(/\/$/, '');
    const uploadUrl = `${base}/media/local/upload?token=${encodeURIComponent(token)}&contentType=${encodeURIComponent(contentType)}&sizeBytes=${sizeBytes}`;
    return { uploadUrl, key, expiresAt, directPut: true };
  }

  async presignGet(key: string, expiresInSec = 3600): Promise<PresignGetResult> {
    const expiresAt = new Date(Date.now() + expiresInSec * 1000);
    const token = this.signToken(key, expiresAt.getTime());
    const base = this.config.apiPublicUrl.replace(/\/$/, '');
    const url = `${base}/media/local/get?token=${encodeURIComponent(token)}`;
    return { url, key, expiresAt };
  }
}

export { encodeKey, decodeKey };

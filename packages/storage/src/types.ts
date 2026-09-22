import type { Readable } from 'node:stream';

export type StorageBackendKind = 's3' | 'local';

export interface StorageHead {
  key: string;
  sizeBytes: number;
  contentType?: string;
  exists: boolean;
}

export interface PresignPutResult {
  /** Absolute URL the client should upload to (S3 signed or API local upload). */
  uploadUrl: string;
  key: string;
  expiresAt: Date;
  /** When true, client must PUT raw bytes to uploadUrl (S3). When false, POST multipart/form to uploadUrl. */
  directPut: boolean;
}

export interface PresignGetResult {
  url: string;
  key: string;
  expiresAt: Date;
}

export interface StorageBackend {
  readonly kind: StorageBackendKind;
  put(key: string, body: Buffer | Uint8Array, contentType?: string): Promise<void>;
  getBuffer(key: string): Promise<Buffer>;
  getStream(key: string): Promise<Readable>;
  head(key: string): Promise<StorageHead>;
  delete(key: string): Promise<void>;
  /** Absolute filesystem path when local; otherwise downloads to destPath and returns destPath. */
  materialize(key: string, destPath: string): Promise<string>;
  presignPut(key: string, contentType: string, sizeBytes: number, expiresInSec?: number): Promise<PresignPutResult>;
  presignGet(key: string, expiresInSec?: number): Promise<PresignGetResult>;
  /** Resolve a storage key to a local absolute path if available (local backend only). */
  localPath?(key: string): string | null;
}

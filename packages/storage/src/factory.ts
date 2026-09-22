import { LocalFsStorageBackend, type LocalFsStorageConfig } from './local.js';
import { S3StorageBackend, type S3StorageConfig } from './s3.js';
import type { StorageBackend, StorageBackendKind } from './types.js';

export interface CreateStorageOptions {
  backend?: StorageBackendKind | string;
  local?: Partial<LocalFsStorageConfig> & { rootDir?: string };
  s3?: Partial<S3StorageConfig>;
  apiPublicUrl?: string;
  signingSecret?: string;
  env?: Record<string, string | undefined>;
}

export function resolveStorageKind(env: Record<string, string | undefined> = process.env): StorageBackendKind {
  const raw = (env.STORAGE_BACKEND ?? 's3').toLowerCase();
  return raw === 'local' ? 'local' : 's3';
}

export function createStorageBackend(options: CreateStorageOptions = {}): StorageBackend {
  const env = options.env ?? process.env;
  const kind = (options.backend as StorageBackendKind | undefined) ?? resolveStorageKind(env);

  if (kind === 'local') {
    const rootDir = options.local?.rootDir ?? env.LOCAL_MEDIA_ROOT ?? './data/media';
    const apiPublicUrl =
      options.local?.apiPublicUrl ??
      options.apiPublicUrl ??
      env.API_URL ??
      'http://localhost:4000';
    const signingSecret =
      options.local?.signingSecret ??
      options.signingSecret ??
      env.JWT_SECRET ??
      env.SESSION_SECRET ??
      'local-media-signing-secret-dev-only';
    return new LocalFsStorageBackend({ rootDir, apiPublicUrl, signingSecret });
  }

  const endpoint = options.s3?.endpoint ?? env.S3_ENDPOINT;
  const accessKeyId = options.s3?.accessKeyId ?? env.S3_ACCESS_KEY;
  const secretAccessKey = options.s3?.secretAccessKey ?? env.S3_SECRET_KEY;
  const bucket = options.s3?.bucket ?? env.S3_BUCKET;
  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error('S3 storage requires S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY, S3_BUCKET');
  }
  return new S3StorageBackend({
    endpoint,
    accessKeyId,
    secretAccessKey,
    bucket,
    region: options.s3?.region ?? env.S3_REGION ?? 'us-east-1',
    forcePathStyle:
      options.s3?.forcePathStyle ??
      (env.S3_FORCE_PATH_STYLE !== undefined ? env.S3_FORCE_PATH_STYLE !== 'false' : true),
  });
}

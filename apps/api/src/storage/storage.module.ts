import { Global, Module } from '@nestjs/common';
import { createStorageBackend, type StorageBackend } from '@studio-os/storage';
import type { Env } from '@studio-os/contracts';
import { ENV } from '../config/env.js';

export const STORAGE = Symbol('STORAGE');

@Global()
@Module({
  providers: [
    {
      provide: STORAGE,
      inject: [ENV],
      useFactory: (env: Env): StorageBackend =>
        createStorageBackend({
          backend: env.STORAGE_BACKEND,
          apiPublicUrl: env.API_URL,
          signingSecret: env.JWT_SECRET,
          local: { rootDir: env.LOCAL_MEDIA_ROOT },
          s3:
            env.STORAGE_BACKEND === 's3'
              ? {
                  endpoint: env.S3_ENDPOINT!,
                  accessKeyId: env.S3_ACCESS_KEY!,
                  secretAccessKey: env.S3_SECRET_KEY!,
                  bucket: env.S3_BUCKET!,
                  region: env.S3_REGION,
                  forcePathStyle: env.S3_FORCE_PATH_STYLE,
                }
              : undefined,
          env: process.env,
        }),
    },
  ],
  exports: [STORAGE],
})
export class StorageModule {}

import { Controller, Get, Inject } from '@nestjs/common';
import type { Env } from '@studio-os/contracts';
import type { StorageBackend } from '@studio-os/storage';
import { ENV } from '../config/env.js';
import { STORAGE } from './storage.module.js';

@Controller('system')
export class SystemController {
  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(STORAGE) private readonly storage: StorageBackend,
  ) {}

  @Get('storage')
  storageInfo() {
    return {
      backend: this.storage.kind,
      label: this.storage.kind === 'local' ? 'Local' : 'Cloud',
      localMediaRoot: this.env.STORAGE_BACKEND === 'local' ? this.env.LOCAL_MEDIA_ROOT : null,
      s3Bucket: this.env.STORAGE_BACKEND === 's3' ? this.env.S3_BUCKET ?? null : null,
    };
  }
}

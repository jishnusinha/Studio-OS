import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Response, Request } from 'express';
import { LocalFsStorageBackend, type StorageBackend } from '@studio-os/storage';
import { STORAGE } from './storage.module.js';

@Controller('media/local')
export class MediaLocalController {
  constructor(@Inject(STORAGE) private readonly storage: StorageBackend) {}

  private local(): LocalFsStorageBackend {
    if (this.storage.kind !== 'local' || !(this.storage instanceof LocalFsStorageBackend)) {
      throw new BadRequestException('Local media routes require STORAGE_BACKEND=local');
    }
    return this.storage;
  }

  @Get('get')
  async get(@Query('token') token: string | undefined, @Res() res: Response) {
    if (!token) throw new BadRequestException('token required');
    const local = this.local();
    const verified = local.verifyToken(token);
    if (!verified) throw new BadRequestException('Invalid or expired token');
    const stream = await local.getStream(verified.key);
    res.setHeader('Content-Type', 'application/octet-stream');
    stream.pipe(res);
  }

  @Put('upload')
  async upload(
    @Query('token') token: string | undefined,
    @Query('contentType') contentType: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    if (!token) throw new BadRequestException('token required');
    const local = this.local();
    const verified = local.verifyToken(token);
    if (!verified) throw new BadRequestException('Invalid or expired token');

    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => resolve());
      req.on('error', reject);
    });
    const body = Buffer.concat(chunks);
    await local.put(verified.key, body, contentType);
    res.status(200).json({ ok: true, key: verified.key, sizeBytes: body.length });
  }
}

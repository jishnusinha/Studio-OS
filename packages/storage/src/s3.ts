import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { PresignGetResult, PresignPutResult, StorageBackend, StorageHead } from './types.js';

export interface S3StorageConfig {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle?: boolean;
}

export class S3StorageBackend implements StorageBackend {
  readonly kind = 's3' as const;
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: S3StorageConfig) {
    this.bucket = config.bucket;
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: config.forcePathStyle ?? true,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async put(key: string, body: Buffer | Uint8Array, contentType?: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async getBuffer(key: string): Promise<Buffer> {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!res.Body) throw new Error(`Empty S3 body for ${key}`);
    const bytes = await res.Body.transformToByteArray();
    return Buffer.from(bytes);
  }

  async getStream(key: string): Promise<Readable> {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!res.Body) throw new Error(`Empty S3 body for ${key}`);
    const body = res.Body;
    if (body instanceof Readable) return body;
    return Readable.fromWeb(body as import('node:stream/web').ReadableStream);
  }

  async head(key: string): Promise<StorageHead> {
    try {
      const res = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return {
        key,
        exists: true,
        sizeBytes: Number(res.ContentLength ?? 0),
        contentType: res.ContentType,
      };
    } catch {
      return { key, exists: false, sizeBytes: 0 };
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async materialize(key: string, destPath: string): Promise<string> {
    const stream = await this.getStream(key);
    await pipeline(stream, createWriteStream(destPath));
    return destPath;
  }

  async presignPut(
    key: string,
    contentType: string,
    sizeBytes: number,
    expiresInSec = 3600,
  ): Promise<PresignPutResult> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
      ContentLength: sizeBytes,
    });
    const uploadUrl = await getSignedUrl(this.client, command, { expiresIn: expiresInSec });
    return {
      uploadUrl,
      key,
      expiresAt: new Date(Date.now() + expiresInSec * 1000),
      directPut: true,
    };
  }

  async presignGet(key: string, expiresInSec = 3600): Promise<PresignGetResult> {
    const url = await getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: expiresInSec },
    );
    return { url, key, expiresAt: new Date(Date.now() + expiresInSec * 1000) };
  }

  getClient(): S3Client {
    return this.client;
  }

  getBucket(): string {
    return this.bucket;
  }
}

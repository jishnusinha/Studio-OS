import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { LocalFsStorageBackend } from './local.js';
import { createStorageBackend, resolveStorageKind } from './factory.js';

describe('resolveStorageKind', () => {
  it('defaults to s3', () => {
    expect(resolveStorageKind({})).toBe('s3');
  });
  it('reads local', () => {
    expect(resolveStorageKind({ STORAGE_BACKEND: 'local' })).toBe('local');
  });
});

describe('LocalFsStorageBackend', () => {
  let root: string;

  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true });
  });

  it('round-trips put/get/head and signed tokens', async () => {
    root = await mkdtemp(join(tmpdir(), 'studioos-storage-'));
    const store = new LocalFsStorageBackend({
      rootDir: root,
      apiPublicUrl: 'http://localhost:4000',
      signingSecret: 'test-secret-at-least-32-characters!!',
    });

    const key = 'projects/p1/assets/a1/clip.mp4';
    await store.put(key, Buffer.from('hello-media'), 'video/mp4');
    const head = await store.head(key);
    expect(head.exists).toBe(true);
    expect(head.sizeBytes).toBe(11);
    expect((await store.getBuffer(key)).toString()).toBe('hello-media');

    const put = await store.presignPut(key, 'video/mp4', 11);
    expect(put.directPut).toBe(true);
    expect(put.uploadUrl).toContain('/media/local/upload');

    const get = await store.presignGet(key);
    expect(get.url).toContain('/media/local/get');
    const token = new URL(get.url).searchParams.get('token')!;
    const verified = store.verifyToken(token);
    expect(verified?.key).toBe(key);

    const dest = join(root, 'out.mp4');
    await store.materialize(key, dest);
    expect(await readFile(dest, 'utf8')).toBe('hello-media');
  });

  it('createStorageBackend(local) works from factory', async () => {
    root = await mkdtemp(join(tmpdir(), 'studioos-storage-'));
    const store = createStorageBackend({
      backend: 'local',
      local: { rootDir: root, apiPublicUrl: 'http://localhost:4000', signingSecret: 'x'.repeat(32) },
    });
    expect(store.kind).toBe('local');
    await store.put('k', Buffer.from('y'));
    expect((await store.getBuffer('k')).toString()).toBe('y');
  });
});

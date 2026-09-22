import { describe, expect, it } from 'vitest';
import {
  hasFfmpeg,
  materializeMockUri,
  synthesizeAudio,
  synthesizeImage,
  synthesizeVideo,
  synthesizeStems,
  synthesizeMidi,
  synthesizeLut,
  synthesizeMatte,
} from './index.js';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('media-synth', () => {
  it('synthesizes an SVG image', async () => {
    const result = await synthesizeImage({ width: 64, height: 48, seed: 42, label: 'shot-A' });
    expect(result.mimeType).toBe('image/svg+xml');
    expect(result.ext).toBe('svg');
    expect(result.buffer.toString('utf8')).toContain('shot-A');
    expect(result.buffer.toString('utf8')).toContain('<svg');
  });

  it('synthesizes audio wav fallback or ffmpeg', async () => {
    const result = await synthesizeAudio({ durationSec: 0.2, seed: 7, kind: 'voice' });
    expect(result.ext).toBe('wav');
    expect(result.buffer.length).toBeGreaterThan(44);
    expect(result.buffer.toString('ascii', 0, 4)).toBe('RIFF');
  });

  it('synthesizes video buffer', async () => {
    const result = await synthesizeVideo({
      durationSec: 0.25,
      width: 64,
      height: 48,
      fps: 8,
      seed: 99,
      label: 'V1',
    });
    expect(result.ext).toBe('mp4');
    expect(result.buffer.length).toBeGreaterThan(16);
  });

  it('synthesizes stems with manifest', async () => {
    const dir = join(tmpdir(), `studioos-stems-${Date.now()}`);
    const result = await synthesizeStems({ durationSec: 0.2, seed: 11, outDir: dir });
    expect(result.stems.length).toBe(4);
    expect(result.ext).toBe('json');
    expect(result.buffer.toString('utf8')).toContain('drums');
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('synthesizes minimal MIDI SMF', () => {
    const result = synthesizeMidi({ seed: 3, durationSec: 2, tempoBpm: 100 });
    expect(result.ext).toBe('mid');
    expect(result.buffer.toString('ascii', 0, 4)).toBe('MThd');
    expect(result.buffer.length).toBeGreaterThan(20);
  });

  it('synthesizes .cube LUT', () => {
    const result = synthesizeLut({ seed: 5, size: 16 });
    expect(result.ext).toBe('cube');
    const text = result.buffer.toString('utf8');
    expect(text).toContain('LUT_3D_SIZE 16');
  });

  it('synthesizes matte with alpha channel content', async () => {
    const result = await synthesizeMatte({ width: 64, height: 48, seed: 9 });
    expect(['svg', 'png']).toContain(result.ext);
    expect(result.buffer.length).toBeGreaterThan(32);
  });

  it('materializes mock://image', async () => {
    const dir = join(tmpdir(), `studioos-mat-${Date.now()}`);
    const { path, mimeType } = await materializeMockUri(
      'mock://image/42.svg?width=32&height=32',
      dir,
    );
    expect(mimeType).toBe('image/svg+xml');
    const body = await fs.readFile(path, 'utf8');
    expect(body).toContain('<svg');
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('materializes mock://midi and mock://lut', async () => {
    const dir = join(tmpdir(), `studioos-mat2-${Date.now()}`);
    const midi = await materializeMockUri('mock://midi/7.mid?duration=2', dir);
    expect(midi.mimeType).toBe('audio/midi');
    const lut = await materializeMockUri('mock://lut/8.cube', dir);
    expect(lut.path.endsWith('.cube')).toBe(true);
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('reports ffmpeg availability', async () => {
    const available = await hasFfmpeg();
    expect(typeof available).toBe('boolean');
  });
});

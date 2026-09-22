import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

let cached: boolean | undefined;

/**
 * Returns whether `ffmpeg -version` succeeds. Result is cached for the process lifetime.
 */
export async function hasFfmpeg(): Promise<boolean> {
  if (cached !== undefined) return cached;
  try {
    await execFileAsync('ffmpeg', ['-version'], {
      timeout: 5000,
      windowsHide: true,
    });
    cached = true;
  } catch {
    cached = false;
  }
  return cached;
}

/** Reset cached detection (tests). */
export function resetFfmpegCache(): void {
  cached = undefined;
}

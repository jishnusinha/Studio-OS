import { toOtio, toEdl, type OtioDocument } from '@studio-os/timeline';
import type { Timeline } from '@studio-os/contracts';

export type { OtioDocument as OtioStub };

/** Export OTIO JSON document for render pipeline consumers. */
export function exportOtio(timeline: Timeline): OtioDocument {
  return toOtio(timeline);
}

export function exportEdl(timeline: Timeline): string {
  return toEdl(timeline);
}

export { toOtio, toOtioStub, toEdl } from '@studio-os/timeline';

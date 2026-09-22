import { describe, expect, it } from 'vitest';
import { can } from '@studio-os/auth';

describe('authorization model', () => {
  it('denies viewer generate/write', () => {
    expect(can('viewer', 'read')).toBe(true);
    expect(can('viewer', 'write')).toBe(false);
    expect(can('viewer', 'generate')).toBe(false);
    expect(can('viewer', 'billing')).toBe(false);
  });

  it('allows director generate but not billing', () => {
    expect(can('director', 'generate')).toBe(true);
    expect(can('director', 'approve')).toBe(true);
    expect(can('director', 'billing')).toBe(false);
  });

  it('allows owner everything', () => {
    expect(can('owner', 'admin')).toBe(true);
    expect(can('owner', 'billing')).toBe(true);
  });

  it('client can approve but not write', () => {
    expect(can('client', 'approve')).toBe(true);
    expect(can('client', 'write')).toBe(false);
  });
});

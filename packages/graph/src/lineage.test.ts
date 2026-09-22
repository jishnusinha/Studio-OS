import { describe, expect, it } from 'vitest';
import {
  findStaleDependents,
  markDependentsStale,
  traverseAncestors,
  traverseDescendants,
  type Relation,
} from './lineage.js';

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const D = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

const relations: Relation[] = [
  { parentAssetId: A, childAssetId: B, relationType: 'derived_from' },
  { parentAssetId: B, childAssetId: C, relationType: 'derived_from' },
  { parentAssetId: A, childAssetId: D, relationType: 'reference' },
];

describe('lineage traversal', () => {
  it('traverses ancestors', () => {
    expect(traverseAncestors(C, relations)).toEqual([B, A]);
    expect(traverseAncestors(B, relations)).toEqual([A]);
    expect(traverseAncestors(A, relations)).toEqual([]);
  });

  it('traverses descendants', () => {
    expect(traverseDescendants(A, relations)).toEqual([B, D, C]);
    expect(traverseDescendants(B, relations)).toEqual([C]);
  });

  it('finds stale dependents of a changed asset', () => {
    expect(findStaleDependents(A, relations)).toEqual([B, D, C]);
  });

  it('marks dependent edges stale without mutating input', () => {
    const updated = markDependentsStale(A, relations);
    expect(relations.every((r) => r.stale !== true)).toBe(true);
    expect(updated.filter((r) => r.stale).map((r) => r.childAssetId).sort()).toEqual(
      [B, C, D].sort(),
    );
  });
});

export type Relation = {
  parentAssetId: string;
  childAssetId: string;
  relationType: string;
  stale?: boolean;
};

function uniquePreserveOrder(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

/** Walk parent links from an asset (children point to parents via parent→child edges). */
export function traverseAncestors(assetId: string, relations: Relation[]): string[] {
  const byChild = new Map<string, Relation[]>();
  for (const rel of relations) {
    const list = byChild.get(rel.childAssetId) ?? [];
    list.push(rel);
    byChild.set(rel.childAssetId, list);
  }

  const ancestors: string[] = [];
  const visited = new Set<string>([assetId]);
  const queue = [assetId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const rel of byChild.get(current) ?? []) {
      if (visited.has(rel.parentAssetId)) continue;
      visited.add(rel.parentAssetId);
      ancestors.push(rel.parentAssetId);
      queue.push(rel.parentAssetId);
    }
  }

  return uniquePreserveOrder(ancestors);
}

export function traverseDescendants(assetId: string, relations: Relation[]): string[] {
  const byParent = new Map<string, Relation[]>();
  for (const rel of relations) {
    const list = byParent.get(rel.parentAssetId) ?? [];
    list.push(rel);
    byParent.set(rel.parentAssetId, list);
  }

  const descendants: string[] = [];
  const visited = new Set<string>([assetId]);
  const queue = [assetId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const rel of byParent.get(current) ?? []) {
      if (visited.has(rel.childAssetId)) continue;
      visited.add(rel.childAssetId);
      descendants.push(rel.childAssetId);
      queue.push(rel.childAssetId);
    }
  }

  return uniquePreserveOrder(descendants);
}

export function findStaleDependents(changedAssetId: string, relations: Relation[]): string[] {
  return traverseDescendants(changedAssetId, relations);
}

/** Returns a new relations array with all descendant edges marked stale. */
export function markDependentsStale(
  changedAssetId: string,
  relations: Relation[],
): Relation[] {
  const dependents = new Set(traverseDescendants(changedAssetId, relations));
  return relations.map((rel) => {
    if (dependents.has(rel.childAssetId) || dependents.has(rel.parentAssetId)) {
      // Mark edges that involve a dependent child (downstream of the change)
      if (dependents.has(rel.childAssetId)) {
        return { ...rel, stale: true };
      }
    }
    return { ...rel };
  });
}

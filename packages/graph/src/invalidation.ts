import {
  findStaleDependents,
  markDependentsStale,
  type Relation,
} from './lineage.js';

export type SuggestedAction =
  | { type: 'mark_stale'; assetId: string }
  | { type: 'regenerate'; assetId: string }
  | { type: 'review'; assetId: string };

export interface SelectiveUpdatePlan {
  affectedAssetIds: string[];
  suggestedActions: SuggestedAction[];
  updatedRelations: Relation[];
}

export function planSelectiveUpdate(
  changedEntityId: string,
  relations: Relation[],
): SelectiveUpdatePlan {
  const affectedAssetIds = findStaleDependents(changedEntityId, relations);
  const updatedRelations = markDependentsStale(changedEntityId, relations);

  const suggestedActions: SuggestedAction[] = affectedAssetIds.flatMap((assetId) => [
    { type: 'mark_stale', assetId },
    { type: 'regenerate', assetId },
    { type: 'review', assetId },
  ]);

  return {
    affectedAssetIds,
    suggestedActions,
    updatedRelations,
  };
}

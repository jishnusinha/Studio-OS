export {
  traverseAncestors,
  traverseDescendants,
  findStaleDependents,
  markDependentsStale,
  type Relation,
} from './lineage.js';

export {
  planSelectiveUpdate,
  type SelectiveUpdatePlan,
  type SuggestedAction,
} from './invalidation.js';

import { SetMetadata } from '@nestjs/common';
import type { RbacAction } from '@studio-os/auth';

export const PROJECT_SCOPE_KEY = 'project_scope';
export const WORKSPACE_SCOPE_KEY = 'workspace_scope';
export const REQUIRED_ACTION_KEY = 'required_action';

/** Where to read the project id from the request.
 *  `via` resolves an entity id (shot/timeline/asset/job/take/deliverable/…) to its projectId. */
export type ScopeSource =
  | {
      from: 'param';
      name: string;
      via?:
        | 'shot'
        | 'timeline'
        | 'asset'
        | 'job'
        | 'take'
        | 'deliverable'
        | 'campaign'
        | 'beat'
        | 'product'
        | 'packshot'
        | 'character'
        | 'location'
        | 'style'
        | 'continuityCheck'
        | 'continuityScore'
        | 'dialogueLine'
        | 'adrSession'
        | 'adrTake'
        | 'mixBus'
        | 'dubbingTrack'
        | 'midiClip'
        | 'musicStem'
        | 'tempoMap'
        | 'scoreCue'
        | 'scoreMarker'
        | 'colorGrade'
        | 'multicamGroup'
        | 'multicamAngle'
        | 'rotoShape'
        | 'mask'
        | 'matte'
        | 'dataset'
        | 'trainingRun'
        | 'adapter'
        | 'workflowDefinition'
        | 'workflowRun'
        | 'presenceSession';
    }
  | { from: 'body'; name: string }
  | { from: 'query'; name: string };

export const ProjectScope = (source: ScopeSource) => SetMetadata(PROJECT_SCOPE_KEY, source);
export const WorkspaceScope = (source: ScopeSource) => SetMetadata(WORKSPACE_SCOPE_KEY, source);
export const RequireAction = (action: RbacAction) => SetMetadata(REQUIRED_ACTION_KEY, action);

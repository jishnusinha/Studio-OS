import type { ProjectRole } from '@studio-os/contracts';

export type RbacAction = 'read' | 'write' | 'generate' | 'approve' | 'admin' | 'billing';

export type RbacResource =
  | 'project'
  | 'asset'
  | 'timeline'
  | 'generation'
  | 'budget'
  | 'members'
  | '*';

/** Higher index = more privileged within creative hierarchy (not a total order for all caps). */
export const ROLE_HIERARCHY: ProjectRole[] = [
  'viewer',
  'reviewer',
  'client',
  'composer',
  'sound',
  'vfx',
  'editor',
  'writer',
  'director',
  'producer',
  'owner',
];

const ALL_ACTIONS: RbacAction[] = ['read', 'write', 'generate', 'approve', 'admin', 'billing'];

const ROLE_PERMISSIONS: Record<ProjectRole, ReadonlySet<RbacAction>> = {
  owner: new Set(ALL_ACTIONS),
  producer: new Set(ALL_ACTIONS),
  director: new Set(['read', 'write', 'generate', 'approve']),
  writer: new Set(['read', 'write', 'generate']),
  editor: new Set(['read', 'write', 'generate']),
  vfx: new Set(['read', 'write', 'generate']),
  sound: new Set(['read', 'write', 'generate']),
  composer: new Set(['read', 'write', 'generate']),
  client: new Set(['read', 'approve']),
  reviewer: new Set(['read', 'approve']),
  viewer: new Set(['read']),
};

export function roleRank(role: ProjectRole): number {
  return ROLE_HIERARCHY.indexOf(role);
}

export function can(role: ProjectRole, action: RbacAction, _resource: RbacResource = '*'): boolean {
  return ROLE_PERMISSIONS[role]?.has(action) ?? false;
}

export function permissionsFor(role: ProjectRole): RbacAction[] {
  return [...(ROLE_PERMISSIONS[role] ?? [])];
}

import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { can, type RbacAction } from '@studio-os/auth';
import type { ProjectRole } from '@studio-os/contracts';
import {
  adapters,
  adrSessions,
  adrTakes,
  assets,
  audioMixBuses,
  campaignBeats,
  campaigns,
  characters,
  colorGrades,
  continuityChecks,
  continuityScores,
  datasets,
  deliverables,
  dialogueLines,
  dubbingTracks,
  generationJobs,
  locations,
  masks,
  mattes,
  midiClips,
  multicamAngles,
  multicamGroups,
  musicStems,
  organizationMembers,
  packshots,
  presenceSessions,
  products,
  projectMembers,
  projects,
  rotoShapes,
  scoreCues,
  scoreMarkers,
  shots,
  styles,
  takes,
  tempoMaps,
  timelines,
  trainingRuns,
  workflowDefinitions,
  workflowRuns,
  workspaces,
  type Database,
} from '@studio-os/db';
import { and, eq } from 'drizzle-orm';
import { DB } from '../db/db.tokens.js';
import type { AuthedRequest } from '../auth/auth.guard.js';
import {
  PROJECT_SCOPE_KEY,
  REQUIRED_ACTION_KEY,
  WORKSPACE_SCOPE_KEY,
  type ScopeSource,
} from './scope.decorators.js';

export type AuthedProjectRequest = AuthedRequest & {
  projectId?: string;
  projectRole?: ProjectRole;
  workspaceId?: string;
};

function readRawId(req: AuthedRequest, source: ScopeSource): string | undefined {
  if (source.from === 'param') {
    const v = req.params?.[source.name];
    return typeof v === 'string' ? v : Array.isArray(v) ? v[0] : undefined;
  }
  if (source.from === 'query') {
    const v = req.query?.[source.name];
    return typeof v === 'string' ? v : undefined;
  }
  const body = req.body as Record<string, unknown> | undefined;
  const v = body?.[source.name];
  return typeof v === 'string' ? v : undefined;
}

async function resolveProjectId(
  db: Database,
  source: ScopeSource,
  rawId: string,
): Promise<string | undefined> {
  if (source.from !== 'param' || !source.via) return rawId;

  if (source.via === 'shot') {
    const [row] = await db
      .select({ projectId: shots.projectId })
      .from(shots)
      .where(eq(shots.id, rawId))
      .limit(1);
    return row?.projectId;
  }
  if (source.via === 'timeline') {
    const [row] = await db
      .select({ projectId: timelines.projectId })
      .from(timelines)
      .where(eq(timelines.id, rawId))
      .limit(1);
    return row?.projectId;
  }
  if (source.via === 'asset') {
    const [row] = await db
      .select({ projectId: assets.projectId })
      .from(assets)
      .where(eq(assets.id, rawId))
      .limit(1);
    return row?.projectId;
  }
  if (source.via === 'job') {
    const [row] = await db
      .select({ projectId: generationJobs.projectId })
      .from(generationJobs)
      .where(eq(generationJobs.id, rawId))
      .limit(1);
    return row?.projectId;
  }
  if (source.via === 'campaign') {
    const [row] = await db
      .select({ projectId: campaigns.projectId })
      .from(campaigns)
      .where(eq(campaigns.id, rawId))
      .limit(1);
    return row?.projectId;
  }
  if (source.via === 'beat') {
    const [row] = await db
      .select({ projectId: campaignBeats.projectId })
      .from(campaignBeats)
      .where(eq(campaignBeats.id, rawId))
      .limit(1);
    return row?.projectId;
  }
  if (source.via === 'product') {
    const [row] = await db
      .select({ projectId: products.projectId })
      .from(products)
      .where(eq(products.id, rawId))
      .limit(1);
    return row?.projectId;
  }
  if (source.via === 'packshot') {
    const [row] = await db
      .select({ projectId: packshots.projectId })
      .from(packshots)
      .where(eq(packshots.id, rawId))
      .limit(1);
    return row?.projectId;
  }
  if (source.via === 'character') {
    const [row] = await db
      .select({ projectId: characters.projectId })
      .from(characters)
      .where(eq(characters.id, rawId))
      .limit(1);
    return row?.projectId;
  }
  if (source.via === 'location') {
    const [row] = await db
      .select({ projectId: locations.projectId })
      .from(locations)
      .where(eq(locations.id, rawId))
      .limit(1);
    return row?.projectId;
  }
  if (source.via === 'style') {
    const [row] = await db
      .select({ projectId: styles.projectId })
      .from(styles)
      .where(eq(styles.id, rawId))
      .limit(1);
    return row?.projectId;
  }
  if (source.via === 'take') {
    const [row] = await db
      .select({ projectId: shots.projectId })
      .from(takes)
      .innerJoin(shots, eq(takes.shotId, shots.id))
      .where(eq(takes.id, rawId))
      .limit(1);
    return row?.projectId;
  }
  if (source.via === 'deliverable') {
    const [row] = await db
      .select({ projectId: deliverables.projectId })
      .from(deliverables)
      .where(eq(deliverables.id, rawId))
      .limit(1);
    return row?.projectId;
  }
  if (source.via === 'continuityCheck') {
    const [row] = await db
      .select({ projectId: continuityChecks.projectId })
      .from(continuityChecks)
      .where(eq(continuityChecks.id, rawId))
      .limit(1);
    return row?.projectId;
  }
  if (source.via === 'continuityScore') {
    const [row] = await db
      .select({ projectId: continuityChecks.projectId })
      .from(continuityScores)
      .innerJoin(continuityChecks, eq(continuityScores.checkId, continuityChecks.id))
      .where(eq(continuityScores.id, rawId))
      .limit(1);
    return row?.projectId;
  }
  if (source.via === 'dialogueLine') {
    const [row] = await db
      .select({ projectId: dialogueLines.projectId })
      .from(dialogueLines)
      .where(eq(dialogueLines.id, rawId))
      .limit(1);
    return row?.projectId;
  }
  if (source.via === 'adrSession') {
    const [row] = await db
      .select({ projectId: adrSessions.projectId })
      .from(adrSessions)
      .where(eq(adrSessions.id, rawId))
      .limit(1);
    return row?.projectId;
  }
  if (source.via === 'adrTake') {
    const [row] = await db
      .select({ projectId: adrTakes.projectId })
      .from(adrTakes)
      .where(eq(adrTakes.id, rawId))
      .limit(1);
    return row?.projectId;
  }
  if (source.via === 'mixBus') {
    const [row] = await db
      .select({ projectId: audioMixBuses.projectId })
      .from(audioMixBuses)
      .where(eq(audioMixBuses.id, rawId))
      .limit(1);
    return row?.projectId;
  }
  if (source.via === 'dubbingTrack') {
    const [row] = await db
      .select({ projectId: dubbingTracks.projectId })
      .from(dubbingTracks)
      .where(eq(dubbingTracks.id, rawId))
      .limit(1);
    return row?.projectId;
  }
  if (source.via === 'midiClip') {
    const [row] = await db
      .select({ projectId: midiClips.projectId })
      .from(midiClips)
      .where(eq(midiClips.id, rawId))
      .limit(1);
    return row?.projectId;
  }
  if (source.via === 'musicStem') {
    const [row] = await db
      .select({ projectId: musicStems.projectId })
      .from(musicStems)
      .where(eq(musicStems.id, rawId))
      .limit(1);
    return row?.projectId;
  }
  if (source.via === 'tempoMap') {
    const [row] = await db
      .select({ projectId: tempoMaps.projectId })
      .from(tempoMaps)
      .where(eq(tempoMaps.id, rawId))
      .limit(1);
    return row?.projectId;
  }
  if (source.via === 'scoreCue') {
    const [row] = await db
      .select({ projectId: scoreCues.projectId })
      .from(scoreCues)
      .where(eq(scoreCues.id, rawId))
      .limit(1);
    return row?.projectId;
  }
  if (source.via === 'scoreMarker') {
    const [row] = await db
      .select({ projectId: scoreMarkers.projectId })
      .from(scoreMarkers)
      .where(eq(scoreMarkers.id, rawId))
      .limit(1);
    return row?.projectId;
  }
  if (source.via === 'colorGrade') {
    const [row] = await db
      .select({ projectId: colorGrades.projectId })
      .from(colorGrades)
      .where(eq(colorGrades.id, rawId))
      .limit(1);
    return row?.projectId;
  }
  if (source.via === 'multicamGroup') {
    const [row] = await db
      .select({ projectId: multicamGroups.projectId })
      .from(multicamGroups)
      .where(eq(multicamGroups.id, rawId))
      .limit(1);
    return row?.projectId;
  }
  if (source.via === 'multicamAngle') {
    const [row] = await db
      .select({ projectId: multicamAngles.projectId })
      .from(multicamAngles)
      .where(eq(multicamAngles.id, rawId))
      .limit(1);
    return row?.projectId;
  }
  if (source.via === 'rotoShape') {
    const [row] = await db
      .select({ projectId: rotoShapes.projectId })
      .from(rotoShapes)
      .where(eq(rotoShapes.id, rawId))
      .limit(1);
    return row?.projectId;
  }
  if (source.via === 'mask') {
    const [row] = await db
      .select({ projectId: masks.projectId })
      .from(masks)
      .where(eq(masks.id, rawId))
      .limit(1);
    return row?.projectId;
  }
  if (source.via === 'matte') {
    const [row] = await db
      .select({ projectId: mattes.projectId })
      .from(mattes)
      .where(eq(mattes.id, rawId))
      .limit(1);
    return row?.projectId;
  }
  if (source.via === 'dataset') {
    const [row] = await db
      .select({ projectId: datasets.projectId })
      .from(datasets)
      .where(eq(datasets.id, rawId))
      .limit(1);
    return row?.projectId;
  }
  if (source.via === 'trainingRun') {
    const [row] = await db
      .select({ projectId: trainingRuns.projectId })
      .from(trainingRuns)
      .where(eq(trainingRuns.id, rawId))
      .limit(1);
    return row?.projectId;
  }
  if (source.via === 'adapter') {
    const [row] = await db
      .select({ projectId: adapters.projectId })
      .from(adapters)
      .where(eq(adapters.id, rawId))
      .limit(1);
    return row?.projectId;
  }
  if (source.via === 'workflowDefinition') {
    const [row] = await db
      .select({ projectId: workflowDefinitions.projectId })
      .from(workflowDefinitions)
      .where(eq(workflowDefinitions.id, rawId))
      .limit(1);
    return row?.projectId;
  }
  if (source.via === 'workflowRun') {
    const [row] = await db
      .select({ projectId: workflowRuns.projectId })
      .from(workflowRuns)
      .where(eq(workflowRuns.id, rawId))
      .limit(1);
    return row?.projectId;
  }
  if (source.via === 'presenceSession') {
    const [row] = await db
      .select({ projectId: presenceSessions.projectId })
      .from(presenceSessions)
      .where(eq(presenceSessions.id, rawId))
      .limit(1);
    return row?.projectId;
  }
  return rawId;
}

@Injectable()
export class ProjectAccessGuard implements CanActivate {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const scope = this.reflector.getAllAndOverride<ScopeSource | undefined>(PROJECT_SCOPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!scope) return true;

    const req = context.switchToHttp().getRequest<AuthedProjectRequest>();
    if (!req.user) throw new ForbiddenException('Not authenticated');

    const rawId = readRawId(req, scope);
    if (!rawId) throw new ForbiddenException('Missing project scope');

    const projectId = await resolveProjectId(this.db, scope, rawId);
    if (!projectId) throw new NotFoundException('Project not found');

    const [project] = await this.db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    if (!project) throw new NotFoundException('Project not found');

    const [member] = await this.db
      .select()
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, req.user.id)))
      .limit(1);
    if (!member) throw new ForbiddenException('Not a project member');

    const role = member.role as ProjectRole;
    const action =
      this.reflector.getAllAndOverride<RbacAction | undefined>(REQUIRED_ACTION_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? 'read';

    if (!can(role, action, 'project')) {
      throw new ForbiddenException(`Role ${role} cannot ${action} this project`);
    }

    req.projectId = projectId;
    req.projectRole = role;
    return true;
  }
}

@Injectable()
export class WorkspaceAccessGuard implements CanActivate {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const scope = this.reflector.getAllAndOverride<ScopeSource | undefined>(WORKSPACE_SCOPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!scope) return true;

    const req = context.switchToHttp().getRequest<AuthedProjectRequest>();
    if (!req.user) throw new ForbiddenException('Not authenticated');

    const workspaceId = readRawId(req, scope);
    if (!workspaceId) throw new ForbiddenException('Missing workspace scope');

    const [ws] = await this.db
      .select({
        id: workspaces.id,
        organizationId: workspaces.organizationId,
      })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);
    if (!ws) throw new NotFoundException('Workspace not found');

    const [member] = await this.db
      .select()
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, ws.organizationId),
          eq(organizationMembers.userId, req.user.id),
        ),
      )
      .limit(1);
    if (!member) throw new ForbiddenException('Not a workspace member');

    req.workspaceId = workspaceId;
    return true;
  }
}

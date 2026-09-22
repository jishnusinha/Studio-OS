import { Body, Controller, Get, Inject, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, type AuthedRequest } from '../auth/auth.guard.js';
import {
  ProjectAccessGuard,
  WorkspaceAccessGuard,
  ProjectScope,
  WorkspaceScope,
  RequireAction,
} from '../common/index.js';
import { AgentService } from '../agent/agent.service.js';
import { ProjectsService } from './projects.service.js';

@Controller()
@UseGuards(AuthGuard)
export class ProjectsController {
  constructor(
    @Inject(ProjectsService) private readonly projects: ProjectsService,
    @Inject(AgentService) private readonly agent: AgentService,
  ) {}

  @Get('workspaces/:id/projects')
  @UseGuards(WorkspaceAccessGuard)
  @WorkspaceScope({ from: 'param', name: 'id' })
  list(@Param('id') workspaceId: string) {
    return this.projects.listByWorkspace(workspaceId);
  }

  @Post('projects')
  @UseGuards(WorkspaceAccessGuard)
  @WorkspaceScope({ from: 'body', name: 'workspaceId' })
  @RequireAction('write')
  create(@Req() req: AuthedRequest, @Body() body: unknown) {
    return this.projects.create(req.user!.id, body);
  }

  @Get('projects/:id')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id' })
  get(@Param('id') id: string) {
    return this.projects.getById(id);
  }

  @Get('projects/:id/search')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id' })
  search(@Param('id') id: string, @Query('q') q?: string) {
    return this.agent.searchProject(id, q ?? '');
  }
}

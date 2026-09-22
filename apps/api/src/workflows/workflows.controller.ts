import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard, type AuthedRequest } from '../auth/auth.guard.js';
import { ProjectAccessGuard, ProjectScope, RequireAction } from '../common/index.js';
import { WorkflowsService } from './workflows.service.js';

@Controller()
@UseGuards(AuthGuard)
export class WorkflowsController {
  constructor(@Inject(WorkflowsService) private readonly workflows: WorkflowsService) {}

  @Get('workflows/steps')
  listSteps() {
    return this.workflows.listStepTypes();
  }

  @Get('projects/:id/workflows')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id' })
  listDefinitions(@Param('id') projectId: string) {
    return this.workflows.listDefinitions(projectId);
  }

  @Post('projects/:id/workflows')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id' })
  @RequireAction('write')
  createDefinition(
    @Param('id') projectId: string,
    @Body() body: unknown,
    @Req() req: AuthedRequest,
  ) {
    return this.workflows.createDefinition(projectId, body, req.user?.id);
  }

  @Get('workflows/:id')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id', via: 'workflowDefinition' })
  getDefinition(@Param('id') id: string) {
    return this.workflows.getDefinition(id);
  }

  @Patch('workflows/:id')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id', via: 'workflowDefinition' })
  @RequireAction('write')
  patchDefinition(@Param('id') id: string, @Body() body: unknown) {
    return this.workflows.patchDefinition(id, body);
  }

  @Post('workflows/:id/runs')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id', via: 'workflowDefinition' })
  @RequireAction('generate')
  startRun(@Param('id') id: string, @Body() body: unknown, @Req() req: AuthedRequest) {
    return this.workflows.startRun(id, body, req.user?.id);
  }

  @Get('projects/:id/workflow-runs')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id' })
  listRuns(
    @Param('id') projectId: string,
    @Query('definitionId') definitionId?: string,
  ) {
    return this.workflows.listRuns(projectId, definitionId);
  }

  @Get('workflow-runs/:id')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id', via: 'workflowRun' })
  getRun(@Param('id') id: string) {
    return this.workflows.getRun(id);
  }
}

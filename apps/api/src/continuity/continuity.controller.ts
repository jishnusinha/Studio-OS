import { Body, Controller, Get, Inject, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, type AuthedRequest } from '../auth/auth.guard.js';
import { ProjectAccessGuard, ProjectScope, RequireAction } from '../common/index.js';
import { ContinuityService } from './continuity.service.js';

@Controller()
@UseGuards(AuthGuard)
export class ContinuityController {
  constructor(@Inject(ContinuityService) private readonly continuity: ContinuityService) {}

  @Post('projects/:id/continuity/run')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id' })
  @RequireAction('generate')
  run(
    @Req() req: AuthedRequest,
    @Param('id') projectId: string,
    @Body() body: unknown,
  ) {
    return this.continuity.runCheck(projectId, req.user!.id, body);
  }

  @Get('projects/:id/continuity/checks')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id' })
  list(@Param('id') projectId: string) {
    return this.continuity.listChecks(projectId);
  }

  @Get('continuity/checks/:id')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id', via: 'continuityCheck' })
  get(@Param('id') id: string) {
    return this.continuity.getCheck(id);
  }

  @Post('continuity/scores/:id/repair')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id', via: 'continuityScore' })
  @RequireAction('generate')
  repairScore(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.continuity.repairScore(id, req.user!.id);
  }

  @Post('continuity/checks/:id/repair-batch')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id', via: 'continuityCheck' })
  @RequireAction('generate')
  repairBatch(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.continuity.repairBatch(id, req.user!.id);
  }
}

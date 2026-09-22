import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard, type AuthedRequest } from '../auth/auth.guard.js';
import { ProjectAccessGuard, ProjectScope, RequireAction } from '../common/index.js';
import { MulticamService } from './multicam.service.js';

@Controller()
@UseGuards(AuthGuard)
export class MulticamController {
  constructor(@Inject(MulticamService) private readonly multicam: MulticamService) {}

  @Get('projects/:id/multicam/groups')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id' })
  listGroups(@Param('id') projectId: string) {
    return this.multicam.listGroups(projectId);
  }

  @Post('projects/:id/multicam/groups')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id' })
  @RequireAction('write')
  createGroup(@Param('id') projectId: string, @Body() body: unknown) {
    return this.multicam.createGroup(projectId, body);
  }

  @Get('multicam-groups/:id')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id', via: 'multicamGroup' })
  getGroup(@Param('id') id: string) {
    return this.multicam.getGroup(id);
  }

  @Patch('multicam-groups/:id')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id', via: 'multicamGroup' })
  @RequireAction('write')
  patchGroup(@Param('id') id: string, @Body() body: unknown) {
    return this.multicam.patchGroup(id, body);
  }

  @Post('multicam-groups/:id/angles')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id', via: 'multicamGroup' })
  @RequireAction('write')
  createAngle(@Param('id') groupId: string, @Body() body: unknown) {
    return this.multicam.createAngle(groupId, body);
  }

  @Patch('multicam-angles/:id')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id', via: 'multicamAngle' })
  @RequireAction('write')
  patchAngle(@Param('id') id: string, @Body() body: unknown) {
    return this.multicam.patchAngle(id, body);
  }

  @Post('multicam-groups/:id/active-angle')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id', via: 'multicamGroup' })
  @RequireAction('write')
  setActiveAngle(@Param('id') groupId: string, @Body() body: { angleId: string }) {
    return this.multicam.setActiveAngle(groupId, body.angleId);
  }

  @Get('projects/:id/multicam/masks')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id' })
  listMasks(@Param('id') projectId: string) {
    return this.multicam.listMasks(projectId);
  }

  @Post('projects/:id/multicam/masks')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id' })
  @RequireAction('write')
  createMask(@Param('id') projectId: string, @Body() body: unknown) {
    return this.multicam.createMask(projectId, body);
  }

  @Get('projects/:id/multicam/roto-shapes')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id' })
  listRoto(@Param('id') projectId: string) {
    return this.multicam.listRotoShapes(projectId);
  }

  @Post('projects/:id/multicam/roto-shapes')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id' })
  @RequireAction('write')
  createRoto(@Param('id') projectId: string, @Body() body: unknown) {
    return this.multicam.createRotoShape(projectId, body);
  }

  @Patch('roto-shapes/:id')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id', via: 'rotoShape' })
  @RequireAction('write')
  patchRoto(@Param('id') id: string, @Body() body: unknown) {
    return this.multicam.patchRotoShape(id, body);
  }

  @Get('projects/:id/multicam/mattes')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id' })
  listMattes(@Param('id') projectId: string) {
    return this.multicam.listMattes(projectId);
  }

  @Post('projects/:id/multicam/mattes')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id' })
  @RequireAction('generate')
  createMatte(
    @Param('id') projectId: string,
    @Body() body: unknown,
    @Req() req: AuthedRequest,
  ) {
    return this.multicam.createMatte(projectId, body, req.user?.id);
  }
}

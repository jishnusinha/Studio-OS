import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import { ProjectAccessGuard, ProjectScope, RequireAction } from '../common/index.js';
import { ColorService } from './color.service.js';

@Controller()
@UseGuards(AuthGuard)
export class ColorController {
  constructor(@Inject(ColorService) private readonly color: ColorService) {}

  @Get('projects/:id/color/grades')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id' })
  listGrades(@Param('id') projectId: string) {
    return this.color.listGrades(projectId);
  }

  @Post('projects/:id/color/grades')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id' })
  @RequireAction('write')
  createGrade(@Param('id') projectId: string, @Body() body: unknown) {
    return this.color.createGrade(projectId, body);
  }

  @Get('color-grades/:id')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id', via: 'colorGrade' })
  getGrade(@Param('id') id: string) {
    return this.color.getGrade(id);
  }

  @Patch('color-grades/:id')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id', via: 'colorGrade' })
  @RequireAction('write')
  patchGrade(@Param('id') id: string, @Body() body: unknown) {
    return this.color.patchGrade(id, body);
  }

  @Get('projects/:id/color/luts')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id' })
  listLuts(@Param('id') projectId: string) {
    return this.color.listLuts(projectId);
  }

  @Post('projects/:id/color/luts')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id' })
  @RequireAction('write')
  createLut(@Param('id') projectId: string, @Body() body: unknown) {
    return this.color.createLut(projectId, body);
  }

  @Get('projects/:id/color/looks')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id' })
  listLooks(@Param('id') projectId: string) {
    return this.color.listLooks(projectId);
  }

  @Post('projects/:id/color/looks')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id' })
  @RequireAction('write')
  createLook(@Param('id') projectId: string, @Body() body: unknown) {
    return this.color.createLook(projectId, body);
  }

  @Get('projects/:id/color/clip-state')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id' })
  listClipStates(
    @Param('id') projectId: string,
    @Query('timelineId') timelineId?: string,
  ) {
    return this.color.listClipStates(projectId, timelineId);
  }

  @Post('projects/:id/color/clip-state')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id' })
  @RequireAction('write')
  upsertClipState(@Param('id') projectId: string, @Body() body: unknown) {
    return this.color.upsertClipState(projectId, body);
  }

  @Post('projects/:id/color/scopes/analyze')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id' })
  @RequireAction('write')
  analyzeScopes(@Param('id') projectId: string, @Body() body: unknown) {
    return this.color.analyzeScopes(projectId, body);
  }

  @Get('projects/:id/color/scopes')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id' })
  listScopes(@Param('id') projectId: string) {
    return this.color.listScopes(projectId);
  }
}

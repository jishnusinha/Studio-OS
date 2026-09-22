import { Body, Controller, Get, Inject, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard, type AuthedRequest } from '../auth/auth.guard.js';
import { ProjectAccessGuard, ProjectScope, RequireAction } from '../common/index.js';
import { TimelineService } from './timeline.service.js';

@Controller()
@UseGuards(AuthGuard)
export class TimelineController {
  constructor(@Inject(TimelineService) private readonly timelines: TimelineService) {}

  @Get('projects/:id/timelines')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id' })
  list(@Param('id') projectId: string) {
    return this.timelines.listByProject(projectId);
  }

  @Post('projects/:id/timelines')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id' })
  @RequireAction('write')
  create(@Param('id') projectId: string, @Body() body: unknown) {
    return this.timelines.create(projectId, body);
  }

  @Get('timelines/:id')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id', via: 'timeline' })
  get(@Param('id') id: string) {
    return this.timelines.getById(id);
  }

  @Get('timelines/:id/preview')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id', via: 'timeline' })
  async preview(
    @Param('id') id: string,
    @Query('t') tRaw: string | undefined,
    @Query('w') wRaw: string | undefined,
    @Query('h') hRaw: string | undefined,
    @Res() res: Response,
  ) {
    const t = Number(tRaw ?? 0);
    const w = wRaw ? Number(wRaw) : undefined;
    const h = hRaw ? Number(hRaw) : undefined;
    const frame = await this.timelines.previewFrame(id, Number.isFinite(t) ? t : 0, w, h);
    res.setHeader('Content-Type', frame.contentType);
    res.setHeader('Cache-Control', 'no-store');
    res.send(frame.buffer);
  }

  @Post('timelines/:id/commands')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id', via: 'timeline' })
  @RequireAction('write')
  command(@Param('id') id: string, @Body() body: unknown) {
    return this.timelines.applyCommand(id, body);
  }

  @Post('timelines/:id/undo')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id', via: 'timeline' })
  @RequireAction('write')
  undo(@Param('id') id: string) {
    return this.timelines.undo(id);
  }

  @Post('timelines/:id/redo')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id', via: 'timeline' })
  @RequireAction('write')
  redo(@Param('id') id: string) {
    return this.timelines.redo(id);
  }

  @Post('timelines/:id/render')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id', via: 'timeline' })
  @RequireAction('generate')
  render(@Param('id') id: string, @Body() body: unknown) {
    return this.timelines.render(id, body);
  }

  @Post('timelines/:id/gaps/:trackId/generate')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id', via: 'timeline' })
  @RequireAction('generate')
  generateGap(
    @Param('id') id: string,
    @Param('trackId') trackId: string,
    @Body() body: unknown,
    @Req() req: AuthedRequest,
  ) {
    return this.timelines.generateIntoGap(id, trackId, body, req.user?.id);
  }
}

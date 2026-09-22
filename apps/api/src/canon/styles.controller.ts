import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import { ProjectAccessGuard, ProjectScope, RequireAction } from '../common/index.js';
import { StylesService } from './styles.service.js';

@Controller()
@UseGuards(AuthGuard)
export class StylesController {
  constructor(@Inject(StylesService) private readonly styles: StylesService) {}

  @Get('projects/:id/styles')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id' })
  list(@Param('id') projectId: string) {
    return this.styles.list(projectId);
  }

  @Post('projects/:id/styles')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id' })
  @RequireAction('write')
  create(@Param('id') projectId: string, @Body() body: unknown) {
    return this.styles.create(projectId, body);
  }

  @Get('styles/:id')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id', via: 'style' })
  get(@Param('id') id: string) {
    return this.styles.get(id);
  }

  @Patch('styles/:id')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id', via: 'style' })
  @RequireAction('write')
  update(@Param('id') id: string, @Body() body: unknown) {
    return this.styles.update(id, body);
  }

  @Delete('styles/:id')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id', via: 'style' })
  @RequireAction('write')
  remove(@Param('id') id: string) {
    return this.styles.remove(id);
  }
}

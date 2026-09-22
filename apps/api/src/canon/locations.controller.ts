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
import { LocationsService } from './locations.service.js';

@Controller()
@UseGuards(AuthGuard)
export class LocationsController {
  constructor(@Inject(LocationsService) private readonly locations: LocationsService) {}

  @Get('projects/:id/locations')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id' })
  list(@Param('id') projectId: string) {
    return this.locations.list(projectId);
  }

  @Post('projects/:id/locations')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id' })
  @RequireAction('write')
  create(@Param('id') projectId: string, @Body() body: unknown) {
    return this.locations.create(projectId, body);
  }

  @Get('locations/:id')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id', via: 'location' })
  get(@Param('id') id: string) {
    return this.locations.get(id);
  }

  @Patch('locations/:id')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id', via: 'location' })
  @RequireAction('write')
  update(@Param('id') id: string, @Body() body: unknown) {
    return this.locations.update(id, body);
  }

  @Delete('locations/:id')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id', via: 'location' })
  @RequireAction('write')
  remove(@Param('id') id: string) {
    return this.locations.remove(id);
  }
}

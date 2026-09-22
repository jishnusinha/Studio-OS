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
import { CharactersService } from './characters.service.js';

@Controller()
@UseGuards(AuthGuard)
export class CharactersController {
  constructor(@Inject(CharactersService) private readonly characters: CharactersService) {}

  @Get('projects/:id/characters')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id' })
  list(@Param('id') projectId: string) {
    return this.characters.list(projectId);
  }

  @Post('projects/:id/characters')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id' })
  @RequireAction('write')
  create(@Param('id') projectId: string, @Body() body: unknown) {
    return this.characters.create(projectId, body);
  }

  @Get('characters/:id')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id', via: 'character' })
  get(@Param('id') id: string) {
    return this.characters.get(id);
  }

  @Patch('characters/:id')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id', via: 'character' })
  @RequireAction('write')
  update(@Param('id') id: string, @Body() body: unknown) {
    return this.characters.update(id, body);
  }

  @Delete('characters/:id')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id', via: 'character' })
  @RequireAction('write')
  remove(@Param('id') id: string) {
    return this.characters.remove(id);
  }
}

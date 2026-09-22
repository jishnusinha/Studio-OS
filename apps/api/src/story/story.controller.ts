import { Body, Controller, Get, Inject, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import { ProjectAccessGuard, ProjectScope, RequireAction } from '../common/index.js';
import { StoryService } from './story.service.js';

@Controller()
@UseGuards(AuthGuard)
export class StoryController {
  constructor(@Inject(StoryService) private readonly story: StoryService) {}

  @Get('projects/:id/story')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id' })
  getStory(@Param('id') projectId: string) {
    return this.story.getStory(projectId);
  }

  @Post('projects/:id/story/extract')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id' })
  @RequireAction('write')
  extract(@Param('id') projectId: string, @Body() body: unknown) {
    return this.story.extract(projectId, body);
  }

  @Post('projects/:id/shots/reorder')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id' })
  @RequireAction('write')
  reorderShots(@Param('id') projectId: string, @Body() body: unknown) {
    return this.story.reorderShots(projectId, body);
  }

  @Patch('shots/:id')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id', via: 'shot' })
  @RequireAction('write')
  patchShot(@Param('id') id: string, @Body() body: unknown) {
    return this.story.patchShot(id, body);
  }

  @Get('shots/:id/takes')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id', via: 'shot' })
  listTakes(@Param('id') id: string) {
    return this.story.listTakes(id);
  }

  @Patch('takes/:id')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id', via: 'take' })
  @RequireAction('write')
  patchTake(@Param('id') id: string, @Body() body: unknown) {
    return this.story.patchTake(id, body);
  }

  @Post('shots/:id/lock-fact')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id', via: 'shot' })
  @RequireAction('write')
  lockFact(@Param('id') id: string, @Body() body: unknown) {
    return this.story.lockFact(id, body);
  }

  @Get('shots/:id/compile-prompt')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id', via: 'shot' })
  compilePrompt(@Param('id') id: string, @Body() body: unknown) {
    return this.story.compilePrompt(id, body);
  }

  @Post('shots/:id/compile-prompt')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id', via: 'shot' })
  @RequireAction('write')
  compilePromptWithOverrides(@Param('id') id: string, @Body() body: unknown) {
    return this.story.compilePrompt(id, body);
  }
}

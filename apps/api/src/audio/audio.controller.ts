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
import { AudioService } from './audio.service.js';

@Controller()
@UseGuards(AuthGuard)
export class AudioController {
  constructor(@Inject(AudioService) private readonly audio: AudioService) {}

  @Get('projects/:id/audio/dialogue')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id' })
  listDialogue(@Param('id') projectId: string) {
    return this.audio.listDialogue(projectId);
  }

  @Post('projects/:id/audio/dialogue/extract')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id' })
  @RequireAction('write')
  extractDialogue(@Param('id') projectId: string, @Body() body: unknown) {
    return this.audio.extractDialogue(projectId, body);
  }

  @Patch('dialogue-lines/:id')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id', via: 'dialogueLine' })
  @RequireAction('write')
  patchDialogue(@Param('id') id: string, @Body() body: unknown) {
    return this.audio.patchDialogueLine(id, body);
  }

  @Get('projects/:id/audio/adr-sessions')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id' })
  listAdrSessions(@Param('id') projectId: string) {
    return this.audio.listAdrSessions(projectId);
  }

  @Post('projects/:id/audio/adr-sessions')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id' })
  @RequireAction('write')
  createAdrSession(@Param('id') projectId: string, @Body() body: unknown) {
    return this.audio.createAdrSession(projectId, body);
  }

  @Get('adr-sessions/:id')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id', via: 'adrSession' })
  getAdrSession(@Param('id') id: string) {
    return this.audio.getAdrSession(id);
  }

  @Post('adr-sessions/:id/takes')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id', via: 'adrSession' })
  @RequireAction('write')
  createAdrTake(@Param('id') sessionId: string, @Body() body: unknown) {
    return this.audio.createAdrTake(sessionId, body);
  }

  @Patch('adr-takes/:id')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id', via: 'adrTake' })
  @RequireAction('write')
  patchAdrTake(@Param('id') id: string, @Body() body: unknown) {
    return this.audio.patchAdrTake(id, body);
  }

  @Get('projects/:id/audio/stems')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id' })
  listStems(@Param('id') projectId: string) {
    return this.audio.listStems(projectId);
  }

  @Post('projects/:id/audio/stems/split')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id' })
  @RequireAction('generate')
  stemSplit(
    @Param('id') projectId: string,
    @Body() body: unknown,
    @Req() req: AuthedRequest,
  ) {
    return this.audio.stemSplit(projectId, body, req.user?.id);
  }

  @Get('projects/:id/audio/mix-buses')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id' })
  listMixBuses(@Param('id') projectId: string) {
    return this.audio.listMixBuses(projectId);
  }

  @Post('projects/:id/audio/mix-buses')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id' })
  @RequireAction('write')
  createMixBus(@Param('id') projectId: string, @Body() body: unknown) {
    return this.audio.createMixBus(projectId, body);
  }

  @Patch('audio-mix-buses/:id')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id', via: 'mixBus' })
  @RequireAction('write')
  patchMixBus(@Param('id') id: string, @Body() body: unknown) {
    return this.audio.patchMixBus(id, body);
  }

  @Get('projects/:id/audio/dubbing')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id' })
  listDubbing(@Param('id') projectId: string) {
    return this.audio.listDubbing(projectId);
  }

  @Post('projects/:id/audio/dubbing')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id' })
  @RequireAction('write')
  createDubbing(@Param('id') projectId: string, @Body() body: unknown) {
    return this.audio.createDubbing(projectId, body);
  }

  @Patch('dubbing-tracks/:id')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id', via: 'dubbingTrack' })
  @RequireAction('write')
  patchDubbing(@Param('id') id: string, @Body() body: unknown) {
    return this.audio.patchDubbing(id, body);
  }
}

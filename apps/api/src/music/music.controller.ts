import {
  Body,
  Controller,
  Delete,
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
import { MusicService } from './music.service.js';

@Controller()
@UseGuards(AuthGuard)
export class MusicController {
  constructor(@Inject(MusicService) private readonly music: MusicService) {}

  @Get('projects/:id/music/midi-clips')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id' })
  listMidiClips(@Param('id') projectId: string) {
    return this.music.listMidiClips(projectId);
  }

  @Post('projects/:id/music/midi-clips')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id' })
  @RequireAction('write')
  createMidiClip(@Param('id') projectId: string, @Body() body: unknown) {
    return this.music.createMidiClip(projectId, body);
  }

  @Post('projects/:id/music/midi/generate')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id' })
  @RequireAction('generate')
  generateMidi(
    @Param('id') projectId: string,
    @Body() body: unknown,
    @Req() req: AuthedRequest,
  ) {
    return this.music.generateMidi(projectId, body, req.user?.id);
  }

  @Get('midi-clips/:id')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id', via: 'midiClip' })
  getMidiClip(@Param('id') id: string) {
    return this.music.getMidiClip(id);
  }

  @Patch('midi-clips/:id')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id', via: 'midiClip' })
  @RequireAction('write')
  patchMidiClip(@Param('id') id: string, @Body() body: unknown) {
    return this.music.patchMidiClip(id, body);
  }

  @Post('midi-clips/:id/events')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id', via: 'midiClip' })
  @RequireAction('write')
  addMidiEvent(@Param('id') clipId: string, @Body() body: unknown) {
    return this.music.addMidiEvent(clipId, body);
  }

  @Delete('midi-clips/:id/events/:eventId')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id', via: 'midiClip' })
  @RequireAction('write')
  deleteMidiEvent(@Param('eventId') eventId: string) {
    return this.music.deleteMidiEvent(eventId);
  }

  @Get('projects/:id/music/score-cues')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id' })
  listScoreCues(@Param('id') projectId: string) {
    return this.music.listScoreCues(projectId);
  }

  @Post('projects/:id/music/score-cues')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id' })
  @RequireAction('write')
  createScoreCue(@Param('id') projectId: string, @Body() body: unknown) {
    return this.music.createScoreCue(projectId, body);
  }

  @Patch('score-cues/:id')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id', via: 'scoreCue' })
  @RequireAction('write')
  patchScoreCue(@Param('id') id: string, @Body() body: unknown) {
    return this.music.patchScoreCue(id, body);
  }

  @Get('projects/:id/music/tempo-maps')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id' })
  listTempoMaps(@Param('id') projectId: string) {
    return this.music.listTempoMaps(projectId);
  }

  @Post('projects/:id/music/tempo-maps')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id' })
  @RequireAction('write')
  createTempoMap(@Param('id') projectId: string, @Body() body: unknown) {
    return this.music.createTempoMap(projectId, body);
  }

  @Patch('tempo-maps/:id')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id', via: 'tempoMap' })
  @RequireAction('write')
  patchTempoMap(@Param('id') id: string, @Body() body: unknown) {
    return this.music.patchTempoMap(id, body);
  }

  @Get('projects/:id/music/stems')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id' })
  listMusicStems(@Param('id') projectId: string) {
    return this.music.listMusicStems(projectId);
  }

  @Post('projects/:id/music/stems')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id' })
  @RequireAction('write')
  createMusicStem(@Param('id') projectId: string, @Body() body: unknown) {
    return this.music.createMusicStem(projectId, body);
  }

  @Patch('music-stems/:id')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id', via: 'musicStem' })
  @RequireAction('write')
  patchMusicStem(@Param('id') id: string, @Body() body: unknown) {
    return this.music.patchMusicStem(id, body);
  }

  @Get('projects/:id/music/score-markers')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id' })
  listScoreMarkers(
    @Param('id') projectId: string,
    @Query('timelineId') timelineId?: string,
  ) {
    return this.music.listScoreMarkers(projectId, timelineId);
  }

  @Post('projects/:id/music/score-markers')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id' })
  @RequireAction('write')
  createScoreMarker(@Param('id') projectId: string, @Body() body: unknown) {
    return this.music.createScoreMarker(projectId, body);
  }

  @Post('projects/:id/music/score-markers/promote')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id' })
  @RequireAction('write')
  promoteMarkers(@Param('id') projectId: string, @Body() body: unknown) {
    return this.music.promoteMarkersFromTimeline(projectId, body);
  }
}

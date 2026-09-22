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
import { CollabService } from './collab.service.js';

@Controller()
@UseGuards(AuthGuard)
export class CollabController {
  constructor(@Inject(CollabService) private readonly collab: CollabService) {}

  @Get('projects/:id/collab/rooms')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id' })
  listRooms(@Param('id') projectId: string) {
    return this.collab.listRooms(projectId);
  }

  @Post('projects/:id/collab/rooms')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id' })
  @RequireAction('write')
  createRoom(@Param('id') projectId: string, @Body() body: unknown) {
    return this.collab.createRoom(projectId, body);
  }

  @Get('projects/:id/collab/presence')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id' })
  listPresence(@Param('id') projectId: string) {
    return this.collab.listPresence(projectId);
  }

  @Post('projects/:id/collab/presence')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id' })
  @RequireAction('write')
  joinPresence(
    @Param('id') projectId: string,
    @Body() body: unknown,
    @Req() req: AuthedRequest,
  ) {
    return this.collab.joinPresence(projectId, req.user!.id, body);
  }

  @Delete('presence/:id')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id', via: 'presenceSession' })
  @RequireAction('write')
  leavePresence(@Param('id') id: string) {
    return this.collab.leavePresence(id);
  }

  @Patch('presence/:id/cursor')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id', via: 'presenceSession' })
  @RequireAction('write')
  updateCursor(@Param('id') id: string, @Body() body: unknown) {
    return this.collab.updateCursor(id, body);
  }

  @Get('projects/:id/collab/docs/:docKey')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id' })
  getDoc(@Param('id') projectId: string, @Param('docKey') docKey: string) {
    return this.collab.getCrdtDocument(projectId, docKey);
  }

  @Post('projects/:id/collab/docs')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id' })
  @RequireAction('write')
  upsertDoc(
    @Param('id') projectId: string,
    @Body() body: unknown,
    @Req() req: AuthedRequest,
  ) {
    return this.collab.upsertCrdtDocument(projectId, body, req.user?.id);
  }

  @Get('projects/:id/collab/comments')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id' })
  listComments(
    @Param('id') projectId: string,
    @Query('targetType') targetType?: string,
    @Query('targetId') targetId?: string,
    @Query('threaded') threaded?: string,
  ) {
    if (threaded === '1' || threaded === 'true') {
      return this.collab.threadedComments(projectId, targetType, targetId);
    }
    return this.collab.listComments(projectId, targetType, targetId);
  }

  @Post('projects/:id/collab/comments')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id' })
  @RequireAction('write')
  createComment(
    @Param('id') projectId: string,
    @Body() body: unknown,
    @Req() req: AuthedRequest,
  ) {
    return this.collab.createComment(projectId, req.user!.id, body);
  }
}

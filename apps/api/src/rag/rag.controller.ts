import { Body, Controller, Inject, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import { ProjectAccessGuard, ProjectScope, RequireAction } from '../common/index.js';
import { RagService } from './rag.service.js';

@Controller()
@UseGuards(AuthGuard)
export class RagController {
  constructor(@Inject(RagService) private readonly rag: RagService) {}

  @Post('projects/:id/knowledge/ingest')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id' })
  @RequireAction('write')
  ingest(@Param('id') projectId: string, @Body() body: unknown) {
    return this.rag.ingest(projectId, body);
  }

  @Post('projects/:id/knowledge/query')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id' })
  query(@Param('id') projectId: string, @Body() body: unknown) {
    return this.rag.query(projectId, body);
  }
}

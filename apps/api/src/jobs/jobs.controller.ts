import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  Req,
  Sse,
  UseGuards,
  type MessageEvent,
} from '@nestjs/common';
import type { Observable } from 'rxjs';
import { AuthGuard, type AuthedRequest } from '../auth/auth.guard.js';
import { ProjectAccessGuard, ProjectScope, RequireAction } from '../common/index.js';
import { JobsService } from './jobs.service.js';

@Controller()
@UseGuards(AuthGuard)
export class JobsController {
  constructor(@Inject(JobsService) private readonly jobs: JobsService) {}

  @Get('jobs')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'query', name: 'projectId' })
  list(@Query('projectId') projectId: string, @Req() req: AuthedRequest) {
    return this.jobs.listForUser(req.user!.id, projectId);
  }

  @Get('jobs/:id')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id', via: 'job' })
  get(@Param('id') id: string) {
    return this.jobs.get(id);
  }

  @Post('jobs/:id/cancel')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id', via: 'job' })
  @RequireAction('generate')
  cancel(@Param('id') id: string) {
    return this.jobs.cancel(id);
  }

  @Post('jobs/:id/retry')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id', via: 'job' })
  @RequireAction('generate')
  retry(@Param('id') id: string) {
    return this.jobs.retry(id);
  }

  @Post('jobs/:id/reprioritize')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id', via: 'job' })
  @RequireAction('generate')
  reprioritize(@Param('id') id: string, @Body() body: { priority?: number }) {
    return this.jobs.reprioritize(id, Number(body?.priority ?? 0));
  }

  @Sse('projects/:id/jobs/stream')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id' })
  stream(@Param('id') projectId: string): Observable<MessageEvent> {
    return this.jobs.streamProjectJobs(projectId);
  }
}

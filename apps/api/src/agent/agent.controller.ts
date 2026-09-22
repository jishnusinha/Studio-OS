import { Body, Controller, Inject, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, type AuthedRequest } from '../auth/auth.guard.js';
import { AgentService } from './agent.service.js';

@Controller('agent')
@UseGuards(AuthGuard)
export class AgentController {
  constructor(@Inject(AgentService) private readonly agent: AgentService) {}

  @Post('preview')
  preview(@Req() req: AuthedRequest, @Body() body: unknown): Promise<unknown> {
    return this.agent.preview(req.user!.id, body);
  }

  @Post('execute')
  execute(@Req() req: AuthedRequest, @Body() body: unknown): Promise<unknown> {
    return this.agent.execute(req.user!.id, body);
  }
}

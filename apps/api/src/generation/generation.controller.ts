import { Body, Controller, Inject, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, type AuthedRequest } from '../auth/auth.guard.js';
import { ProjectAccessGuard, ProjectScope, RequireAction } from '../common/index.js';
import { GenerationService } from './generation.service.js';

@Controller()
@UseGuards(AuthGuard, ProjectAccessGuard)
export class GenerationController {
  constructor(@Inject(GenerationService) private readonly generation: GenerationService) {}

  @Post('generate/estimate')
  @ProjectScope({ from: 'body', name: 'projectId' })
  @RequireAction('generate')
  estimate(@Body() body: unknown) {
    return this.generation.estimate(body);
  }

  @Post('generate')
  @ProjectScope({ from: 'body', name: 'projectId' })
  @RequireAction('generate')
  generate(@Req() req: AuthedRequest, @Body() body: unknown) {
    return this.generation.generate(req.user!.id, body);
  }
}

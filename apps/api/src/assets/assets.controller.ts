import { Body, Controller, Get, Inject, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, type AuthedRequest } from '../auth/auth.guard.js';
import { ProjectAccessGuard, ProjectScope, RequireAction } from '../common/index.js';
import { AssetsService } from './assets.service.js';

@Controller()
@UseGuards(AuthGuard)
export class AssetsController {
  constructor(@Inject(AssetsService) private readonly assets: AssetsService) {}

  @Post('assets/presign')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'body', name: 'projectId' })
  @RequireAction('write')
  presign(@Req() req: AuthedRequest, @Body() body: unknown) {
    return this.assets.presign(req.user!.id, body);
  }

  @Post('assets/:id/complete')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id', via: 'asset' })
  @RequireAction('write')
  complete(@Param('id') id: string) {
    return this.assets.complete(id);
  }

  @Get('projects/:id/assets')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id' })
  list(@Param('id') projectId: string, @Req() req: AuthedRequest) {
    const q = req.query ?? {};
    return this.assets.listByProject(projectId, {
      type: q.type as string | undefined,
      status: q.status as string | undefined,
      character: q.character as string | undefined,
      scene: q.scene as string | undefined,
      model: q.model as string | undefined,
      source: q.source as string | undefined,
      rating: q.rating as string | undefined,
      q: q.q as string | undefined,
    });
  }

  @Get('assets/:id')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id', via: 'asset' })
  get(@Param('id') id: string) {
    return this.assets.getById(id);
  }

  @Get('assets/:id/url')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id', via: 'asset' })
  signedUrl(@Param('id') id: string, @Req() req: AuthedRequest) {
    const variant = (req.query?.variant as string) ?? 'proxy';
    return this.assets.getSignedUrl(id, variant);
  }

  @Get('assets/:id/lineage')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id', via: 'asset' })
  lineage(@Param('id') id: string) {
    return this.assets.getLineage(id);
  }

  @Post('assets/:id/lineage/update-stale')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id', via: 'asset' })
  @RequireAction('write')
  updateStale(@Param('id') id: string) {
    return this.assets.updateStaleDependents(id);
  }

  @Get('deliverables/:id/url')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id', via: 'deliverable' })
  deliverableUrl(@Param('id') id: string) {
    return this.assets.getDeliverableSignedUrl(id);
  }
}

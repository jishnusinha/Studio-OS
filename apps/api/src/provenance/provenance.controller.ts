import { Body, Controller, Get, Inject, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import { ProjectAccessGuard, ProjectScope, RequireAction } from '../common/index.js';
import { ProvenanceService } from './provenance.service.js';

@Controller()
@UseGuards(AuthGuard)
export class ProvenanceController {
  constructor(@Inject(ProvenanceService) private readonly provenance: ProvenanceService) {}

  @Get('assets/:id/credentials')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id', via: 'asset' })
  getCredentials(@Param('id') assetId: string) {
    return this.provenance.getAssetCredentials(assetId);
  }

  @Post('assets/:id/credentials/sign')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id', via: 'asset' })
  @RequireAction('write')
  sign(@Param('id') assetId: string, @Body() body: unknown) {
    return this.provenance.signAsset(assetId, body);
  }

  @Post('deliverables/:id/credentials/embed')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id', via: 'deliverable' })
  @RequireAction('write')
  embed(@Param('id') deliverableId: string) {
    return this.provenance.embedDeliverableCredentials(deliverableId);
  }
}

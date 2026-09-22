import {
  Body,
  Controller,
  Delete,
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
import { BrandService } from './brand.service.js';
import { CampaignService } from './campaign.service.js';
import { ProductsService } from './products.service.js';
import { VariantService } from './variant.service.js';

@Controller()
@UseGuards(AuthGuard)
export class CommercialController {
  constructor(
    @Inject(BrandService) private readonly brands: BrandService,
    @Inject(ProductsService) private readonly products: ProductsService,
    @Inject(CampaignService) private readonly campaigns: CampaignService,
    @Inject(VariantService) private readonly variants: VariantService,
  ) {}

  // ── C1 Brand DNA ──────────────────────────────────────────────

  @Get('projects/:id/brand')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id' })
  getBrand(@Param('id') projectId: string) {
    return this.brands.getBrand(projectId);
  }

  @Post('projects/:id/brand/ingest')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id' })
  @RequireAction('write')
  ingestBrand(@Param('id') projectId: string, @Body() body: unknown) {
    return this.brands.ingest(projectId, body);
  }

  @Patch('projects/:id/brand')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id' })
  @RequireAction('write')
  patchBrand(@Param('id') projectId: string, @Body() body: unknown) {
    return this.brands.patchDna(projectId, body);
  }

  // ── Products + packshots ──────────────────────────────────────
  // Product CRUD lives in CanonModule (ProductsController).
  // Packshot asset binding stays here.

  @Get('products/:id/packshots')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id', via: 'product' })
  listPackshots(@Param('id') productId: string) {
    return this.products.listPackshots(productId);
  }

  @Post('products/:id/packshots')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id', via: 'product' })
  @RequireAction('write')
  addPackshot(@Param('id') productId: string, @Body() body: unknown) {
    return this.products.addPackshot(productId, body);
  }

  @Delete('packshots/:id')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id', via: 'packshot' })
  @RequireAction('write')
  deletePackshot(@Param('id') id: string) {
    return this.products.removePackshot(id);
  }

  // ── C2 Campaign templates ─────────────────────────────────────

  @Get('commercial/templates')
  listTemplates() {
    return this.campaigns.listTemplates();
  }

  @Get('projects/:id/campaigns')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id' })
  listCampaigns(@Param('id') projectId: string) {
    return this.campaigns.listCampaigns(projectId);
  }

  @Post('projects/:id/campaigns')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id' })
  @RequireAction('write')
  createCampaign(@Param('id') projectId: string, @Body() body: unknown) {
    return this.campaigns.createFromTemplate(projectId, body);
  }

  @Get('campaigns/:id')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id', via: 'campaign' })
  getCampaign(@Param('id') id: string) {
    return this.campaigns.getCampaign(id);
  }

  @Patch('campaigns/beats/:id')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id', via: 'beat' })
  @RequireAction('write')
  patchBeat(@Param('id') id: string, @Body() body: unknown) {
    return this.campaigns.patchBeat(id, body);
  }

  @Post('campaigns/beats/:id/regenerate')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id', via: 'beat' })
  @RequireAction('generate')
  regenerateBeat(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.campaigns.regenerateBeat(id, req.user!.id);
  }

  // ── C3 Variant Factory ────────────────────────────────────────

  @Get('campaigns/:id/variants/matrix')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id', via: 'campaign' })
  variantMatrix(@Param('id') id: string) {
    return this.variants.matrix(id);
  }

  @Post('campaigns/:id/variants/estimate')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id', via: 'campaign' })
  @RequireAction('generate')
  estimateVariants(@Param('id') id: string, @Body() body: unknown) {
    return this.variants.estimate(id, body);
  }

  @Post('campaigns/:id/variants/generate')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id', via: 'campaign' })
  @RequireAction('generate')
  generateVariants(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.variants.generate(id, req.user!.id, body);
  }
}

import { Module } from '@nestjs/common';
import { CommercialController } from './commercial.controller.js';
import { BrandService } from './brand.service.js';
import { CampaignService } from './campaign.service.js';
import { ProductsService } from './products.service.js';
import { VariantService } from './variant.service.js';

@Module({
  controllers: [CommercialController],
  providers: [BrandService, ProductsService, CampaignService, VariantService],
  exports: [BrandService, ProductsService, CampaignService, VariantService],
})
export class CommercialModule {}

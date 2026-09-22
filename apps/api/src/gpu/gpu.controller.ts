import { Body, Controller, Get, Inject, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import { GpuService } from './gpu.service.js';

@Controller('gpu')
@UseGuards(AuthGuard)
export class GpuController {
  constructor(@Inject(GpuService) private readonly gpu: GpuService) {}

  @Get('endpoints')
  listEndpoints() {
    return this.gpu.listEndpoints();
  }

  @Post('endpoints')
  createEndpoint(@Body() body: unknown) {
    return this.gpu.createEndpoint(body);
  }

  @Post('endpoints/:id/health')
  healthCheck(@Param('id') id: string) {
    return this.gpu.healthCheck(id);
  }

  @Get('pools')
  listPools() {
    return this.gpu.listPools();
  }

  @Post('pools')
  createPool(@Body() body: unknown) {
    return this.gpu.createPool(body);
  }

  @Get('weights')
  listWeights() {
    return this.gpu.listWeights();
  }

  @Post('weights')
  createWeight(@Body() body: unknown) {
    return this.gpu.createWeight(body);
  }

  @Post('weights/deploy')
  deployWeight(@Body() body: unknown) {
    return this.gpu.deployWeight(body);
  }
}

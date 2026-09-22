import { Module } from '@nestjs/common';
import { GenerationModule } from '../generation/generation.module.js';
import { GpuController } from './gpu.controller.js';
import { GpuService } from './gpu.service.js';

@Module({
  imports: [GenerationModule],
  controllers: [GpuController],
  providers: [GpuService],
  exports: [GpuService],
})
export class GpuModule {}

import { Module } from '@nestjs/common';
import { GenerationModule } from '../generation/generation.module.js';
import { MulticamController } from './multicam.controller.js';
import { MulticamService } from './multicam.service.js';

@Module({
  imports: [GenerationModule],
  controllers: [MulticamController],
  providers: [MulticamService],
  exports: [MulticamService],
})
export class MulticamModule {}

import { Module } from '@nestjs/common';
import { GenerationModule } from '../generation/generation.module.js';
import { JobsController } from './jobs.controller.js';
import { JobsService } from './jobs.service.js';

@Module({
  imports: [GenerationModule],
  controllers: [JobsController],
  providers: [JobsService],
})
export class JobsModule {}

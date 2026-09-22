import { Module } from '@nestjs/common';
import { ContinuityController } from './continuity.controller.js';
import { ContinuityService } from './continuity.service.js';

@Module({
  controllers: [ContinuityController],
  providers: [ContinuityService],
  exports: [ContinuityService],
})
export class ContinuityModule {}

import { Module } from '@nestjs/common';
import { TrainingController } from './training.controller.js';
import { TrainingService } from './training.service.js';

@Module({
  controllers: [TrainingController],
  providers: [TrainingService],
  exports: [TrainingService],
})
export class TrainingModule {}

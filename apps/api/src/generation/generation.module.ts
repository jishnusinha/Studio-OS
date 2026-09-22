import { Module } from '@nestjs/common';
import { QueueModule } from '../queue/queue.module.js';
import { GenerationQueueService } from '../queue/generation-queue.service.js';
import { GenerationController } from './generation.controller.js';
import { GenerationService } from './generation.service.js';
import { GenerationWorkflow } from './generation.workflow.js';
import { GatewayFactory } from './gateway.factory.js';

@Module({
  imports: [QueueModule],
  controllers: [GenerationController],
  providers: [
    GenerationService,
    GenerationWorkflow,
    GatewayFactory,
    GenerationQueueService,
  ],
  exports: [GenerationService, GenerationWorkflow, GatewayFactory, GenerationQueueService],
})
export class GenerationModule {}

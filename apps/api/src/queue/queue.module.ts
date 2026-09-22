import { Module } from '@nestjs/common';
import { MediaQueueService } from './media-queue.service.js';
import { RenderQueueService } from './render-queue.service.js';

@Module({
  providers: [MediaQueueService, RenderQueueService],
  exports: [MediaQueueService, RenderQueueService],
})
export class QueueModule {}

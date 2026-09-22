import { Module, forwardRef } from '@nestjs/common';
import { GenerationModule } from '../generation/generation.module.js';
import { QueueModule } from '../queue/queue.module.js';
import { TimelineController } from './timeline.controller.js';
import { TimelineService } from './timeline.service.js';

@Module({
  imports: [QueueModule, forwardRef(() => GenerationModule)],
  controllers: [TimelineController],
  providers: [TimelineService],
  exports: [TimelineService],
})
export class TimelineModule {}

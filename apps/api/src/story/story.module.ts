import { Module } from '@nestjs/common';
import { GenerationModule } from '../generation/generation.module.js';
import { StoryController } from './story.controller.js';
import { StoryService } from './story.service.js';

@Module({
  imports: [GenerationModule],
  controllers: [StoryController],
  providers: [StoryService],
  exports: [StoryService],
})
export class StoryModule {}

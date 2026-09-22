import { Module } from '@nestjs/common';
import { GenerationModule } from '../generation/generation.module.js';
import { RagModule } from '../rag/rag.module.js';
import { TimelineModule } from '../timeline/timeline.module.js';
import { AgentController } from './agent.controller.js';
import { AgentService } from './agent.service.js';

@Module({
  imports: [GenerationModule, TimelineModule, RagModule],
  controllers: [AgentController],
  providers: [AgentService],
  exports: [AgentService],
})
export class AgentModule {}

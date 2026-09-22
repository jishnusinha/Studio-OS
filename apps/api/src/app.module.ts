import { Module } from '@nestjs/common';
import { EnvModule } from './config/env.module.js';
import { DbModule } from './db/db.module.js';
import { CommonModule } from './common/common.module.js';
import { AuthModule } from './auth/auth.module.js';
import { ProjectsModule } from './projects/projects.module.js';
import { AssetsModule } from './assets/assets.module.js';
import { StoryModule } from './story/story.module.js';
import { ModelsModule } from './models/models.module.js';
import { GenerationModule } from './generation/generation.module.js';
import { JobsModule } from './jobs/jobs.module.js';
import { TimelineModule } from './timeline/timeline.module.js';
import { BillingModule } from './billing/billing.module.js';
import { AgentModule } from './agent/agent.module.js';
import { RagModule } from './rag/rag.module.js';
import { QueueModule } from './queue/queue.module.js';
import { CommercialModule } from './commercial/commercial.module.js';
import { ContinuityModule } from './continuity/continuity.module.js';
import { CanonModule } from './canon/canon.module.js';
import { AudioModule } from './audio/audio.module.js';
import { MusicModule } from './music/music.module.js';
import { ColorModule } from './color/color.module.js';
import { MulticamModule } from './multicam/multicam.module.js';
import { TrainingModule } from './training/training.module.js';
import { WorkflowsModule } from './workflows/workflows.module.js';
import { CollabModule } from './collab/collab.module.js';
import { ProvenanceModule } from './provenance/provenance.module.js';
import { GpuModule } from './gpu/gpu.module.js';
import { HealthController } from './health.controller.js';
import { StorageModule } from './storage/storage.module.js';
import { MediaLocalController } from './storage/media-local.controller.js';
import { SystemController } from './storage/system.controller.js';

@Module({
  imports: [
    EnvModule,
    StorageModule,
    DbModule,
    CommonModule,
    AuthModule,
    ProjectsModule,
    AssetsModule,
    StoryModule,
    CanonModule,
    ModelsModule,
    GenerationModule,
    JobsModule,
    TimelineModule,
    BillingModule,
    AgentModule,
    RagModule,
    QueueModule,
    CommercialModule,
    ContinuityModule,
    AudioModule,
    MusicModule,
    ColorModule,
    MulticamModule,
    TrainingModule,
    WorkflowsModule,
    CollabModule,
    ProvenanceModule,
    GpuModule,
  ],
  controllers: [HealthController, MediaLocalController, SystemController],
})
export class AppModule {}

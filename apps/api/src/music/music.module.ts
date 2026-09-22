import { Module } from '@nestjs/common';
import { GenerationModule } from '../generation/generation.module.js';
import { MusicController } from './music.controller.js';
import { MusicService } from './music.service.js';

@Module({
  imports: [GenerationModule],
  controllers: [MusicController],
  providers: [MusicService],
  exports: [MusicService],
})
export class MusicModule {}

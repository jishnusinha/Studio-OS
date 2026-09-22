import { Module } from '@nestjs/common';
import { GenerationModule } from '../generation/generation.module.js';
import { AudioController } from './audio.controller.js';
import { AudioService } from './audio.service.js';

@Module({
  imports: [GenerationModule],
  controllers: [AudioController],
  providers: [AudioService],
  exports: [AudioService],
})
export class AudioModule {}

import { Module } from '@nestjs/common';
import { CollabController } from './collab.controller.js';
import { CollabGateway } from './collab.gateway.js';
import { CollabService } from './collab.service.js';

@Module({
  controllers: [CollabController],
  providers: [CollabService, CollabGateway],
  exports: [CollabService],
})
export class CollabModule {}

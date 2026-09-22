import { Module } from '@nestjs/common';
import { ProvenanceController } from './provenance.controller.js';
import { ProvenanceService } from './provenance.service.js';

@Module({
  controllers: [ProvenanceController],
  providers: [ProvenanceService],
  exports: [ProvenanceService],
})
export class ProvenanceModule {}

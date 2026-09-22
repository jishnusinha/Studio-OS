import { Module } from '@nestjs/common';
import { ColorController } from './color.controller.js';
import { ColorService } from './color.service.js';

@Module({
  controllers: [ColorController],
  providers: [ColorService],
  exports: [ColorService],
})
export class ColorModule {}

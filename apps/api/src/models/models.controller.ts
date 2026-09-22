import { Body, Controller, Get, Inject, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import { ModelsService } from './models.service.js';

@Controller('models')
@UseGuards(AuthGuard)
export class ModelsController {
  constructor(@Inject(ModelsService) private readonly models: ModelsService) {}

  @Get()
  list(@Query('all') all?: string) {
    if (all === '1' || all === 'true') return this.models.listAll();
    return this.models.listPublished();
  }

  @Post()
  create(@Body() body: unknown) {
    return this.models.create(body);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.models.getById(id);
  }

  @Post(':id/test-connection')
  testConnection(@Param('id') id: string) {
    return this.models.testConnection(id);
  }

  @Post(':id/test-generation')
  testGeneration(@Param('id') id: string, @Body() body: unknown) {
    return this.models.testGeneration(id, body);
  }

  @Post(':id/publish')
  publish(@Param('id') id: string, @Body() body: { published?: boolean }) {
    return this.models.publish(id, body?.published !== false);
  }
}

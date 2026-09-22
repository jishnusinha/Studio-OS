import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import { ProjectAccessGuard, ProjectScope, RequireAction } from '../common/index.js';
import { ProductsService } from './products.service.js';

/**
 * Canon product CRUD (name, packshots, claims).
 * Packshot asset binding endpoints also live under CommercialModule.
 */
@Controller()
@UseGuards(AuthGuard)
export class ProductsController {
  constructor(@Inject(ProductsService) private readonly products: ProductsService) {}

  @Get('projects/:id/products')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id' })
  list(@Param('id') projectId: string) {
    return this.products.list(projectId);
  }

  @Post('projects/:id/products')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id' })
  @RequireAction('write')
  create(@Param('id') projectId: string, @Body() body: unknown) {
    return this.products.create(projectId, body);
  }

  @Get('products/:id')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id', via: 'product' })
  get(@Param('id') id: string) {
    return this.products.get(id);
  }

  @Patch('products/:id')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id', via: 'product' })
  @RequireAction('write')
  update(@Param('id') id: string, @Body() body: unknown) {
    return this.products.update(id, body);
  }

  @Delete('products/:id')
  @UseGuards(ProjectAccessGuard)
  @ProjectScope({ from: 'param', name: 'id', via: 'product' })
  @RequireAction('write')
  remove(@Param('id') id: string) {
    return this.products.remove(id);
  }
}

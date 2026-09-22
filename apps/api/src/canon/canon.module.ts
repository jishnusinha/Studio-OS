import { Module } from '@nestjs/common';
import { CharactersController } from './characters.controller.js';
import { CharactersService } from './characters.service.js';
import { LocationsController } from './locations.controller.js';
import { LocationsService } from './locations.service.js';
import { ProductsController } from './products.controller.js';
import { ProductsService } from './products.service.js';
import { StylesController } from './styles.controller.js';
import { StylesService } from './styles.service.js';

@Module({
  controllers: [
    CharactersController,
    LocationsController,
    ProductsController,
    StylesController,
  ],
  providers: [CharactersService, LocationsService, ProductsService, StylesService],
  exports: [CharactersService, LocationsService, ProductsService, StylesService],
})
export class CanonModule {}

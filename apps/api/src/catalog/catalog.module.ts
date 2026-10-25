import { Module } from '@nestjs/common';
import { CatalogService } from './catalog.service';
import { CatalogController } from './catalog.controller';
import { PlaceholdersController } from './placeholders.controller';

@Module({
  providers: [CatalogService],
  controllers: [CatalogController, PlaceholdersController],
  exports: [CatalogService],
})
export class CatalogModule {}

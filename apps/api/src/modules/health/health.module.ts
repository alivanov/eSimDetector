import { Module } from '@nestjs/common';

import { CatalogModule } from '../catalog/catalog.module';
import { HealthController } from './health.controller';

@Module({
  imports: [CatalogModule],
  controllers: [HealthController],
})
export class HealthModule {}

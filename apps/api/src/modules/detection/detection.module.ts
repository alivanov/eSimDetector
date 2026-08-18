import { Module } from '@nestjs/common';

import { CatalogModule } from '../catalog/catalog.module';
import { ResolutionLogModule } from '../resolution-log/resolution-log.module';

import { DetectionController } from './detection.controller';
import { DetectionService } from './detection.service';
import { ScreenSignatureModule } from './ios/screen-signature.module';

/**
 * Автоопределение устройства по сигналам (docs/03-detection-algorithm.md) — `POST /api/v1/detect`
 * (docs/06-api-contract.md §6.2). Зависит от `CatalogModule` (единственная точка доступа к
 * справочнику), `ScreenSignatureModule` (резолюция ветки iOS по сигнатурам экрана) и
 * `ResolutionLogModule` (журнал резолюций, docs/05 §5.6).
 */
@Module({
  imports: [CatalogModule, ScreenSignatureModule, ResolutionLogModule],
  controllers: [DetectionController],
  providers: [DetectionService],
  exports: [DetectionService],
})
export class DetectionModule {}

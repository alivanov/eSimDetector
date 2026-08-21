import { Module } from '@nestjs/common';

import { CatalogModule } from '../catalog/catalog.module';
import { ModerationModule } from '../moderation/moderation.module';
import { ResolutionLogModule } from '../resolution-log/resolution-log.module';

import { DetectionController } from './detection.controller';
import { DetectionService } from './detection.service';
import { ScreenSignatureModule } from './ios/screen-signature.module';

/**
 * Автоопределение устройства по сигналам (docs/03-detection-algorithm.md) — `POST /api/v1/detect`
 * (docs/06-api-contract.md §6.2). Зависит от `CatalogModule` (единственная точка доступа к
 * справочнику), `ScreenSignatureModule` (резолюция ветки iOS по сигнатурам экрана),
 * `ResolutionLogModule` (журнал резолюций, docs/05 §5.6) и `ModerationModule` (этап 7: запись
 * задач `unknown_model_code`/`unknown_screen_signature` в очередь модерации, docs/15 §15.2, —
 * `ModerationModule` НЕ импортирует `DetectionModule` обратно, цикла нет).
 */
@Module({
  imports: [CatalogModule, ScreenSignatureModule, ResolutionLogModule, ModerationModule],
  controllers: [DetectionController],
  providers: [DetectionService],
  exports: [DetectionService],
})
export class DetectionModule {}

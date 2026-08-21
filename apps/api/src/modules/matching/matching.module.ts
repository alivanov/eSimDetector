import { Module } from '@nestjs/common';

import { CatalogModule } from '../catalog/catalog.module';
import { ModerationModule } from '../moderation/moderation.module';

import { BrandsController } from './brands.controller';
import { DeviceCatalogQueryService } from './device-catalog-query.service';
import { normalizationDictionaryProvider } from './dictionary/normalization-dictionary.provider';
import { MatchingController } from './matching.controller';
import { MatchingService } from './matching.service';

/**
 * Обработка текстового ввода (docs/04-matching-algorithm.md) — `GET/POST /api/v1/devices/search`,
 * `GET /api/v1/devices/suggest` (docs/06-api-contract.md §6.3—6.4). Зависит от `CatalogModule`
 * (единственная точка доступа к справочнику, .cursor/rules/api-boundaries.mdc), от словаря
 * нормализации, загружаемого один раз при старте, и от `ModerationModule` (этап 7: запись задач
 * `unmatched_query`/`ambiguous_query`, docs/15 §15.2 — `ModerationModule` не импортирует
 * `MatchingModule` обратно, цикла нет, см. комментарий в `moderation.module.ts`).
 */
@Module({
  imports: [CatalogModule, ModerationModule],
  controllers: [MatchingController, BrandsController],
  providers: [MatchingService, DeviceCatalogQueryService, normalizationDictionaryProvider],
  exports: [MatchingService],
})
export class MatchingModule {}

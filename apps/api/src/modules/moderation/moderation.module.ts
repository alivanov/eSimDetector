import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { CatalogModule } from '../catalog/catalog.module';
import {
  CATALOG_OVERRIDE_MODEL_NAME,
  catalogOverrideMongooseSchema,
} from '../catalog/schemas/catalog-override.schema';
import { DEVICE_MODEL_NAME, deviceMongooseSchema } from '../catalog/schemas/device.schema';
import {
  SCREEN_SIGNATURE_MODEL_NAME,
  screenSignatureMongooseSchema,
} from '../catalog/schemas/screen-signature.schema';
import { ScreenSignatureModule } from '../detection/ios/screen-signature.module';
import { normalizationDictionaryProvider } from '../matching/dictionary/normalization-dictionary.provider';

import { AdminCatalogController } from './admin-catalog.controller';
import { AdminDeviceQueryService } from './admin-device-query.service';
import { CatalogChangeLogService } from './catalog-change-log.service';
import { CatalogReloadService } from './catalog-reload.service';
import { CatalogStatsService } from './catalog-stats.service';
import { CatalogWriteService } from './catalog-write.service';
import { ModerationResolutionService } from './moderation-resolution.service';
import { ModerationTaskService } from './moderation-task.service';
import { ModerationTasksController } from './moderation-tasks.controller';
import {
  CATALOG_CHANGE_MODEL_NAME,
  catalogChangeMongooseSchema,
} from './schemas/catalog-change.schema';
import {
  MODERATION_TASK_MODEL_NAME,
  moderationTaskMongooseSchema,
} from './schemas/moderation-task.schema';
import { SuggestionsService } from './suggestions.service';

/**
 * Модерация справочника (docs/15-moderation.md; ADR-014) — очередь задач, подсказки, действия
 * модератора, журнал изменений, раздел `/admin`. Не переписывает `CatalogModule`/
 * `ScreenSignatureModule` (AGENTS.md): импортирует их как готовые зависимости и переиспользует
 * уже экспортированные Mongoose-схемы для `devices`/`catalog_overrides`/`screen_signatures` —
 * тот же приём, что и у `ScreenSignatureModule` самого (повторная `forFeature`-регистрация той
 * же схемы в разных модулях поддерживается Mongoose без конфликта).
 *
 * НЕ импортирует `DetectionModule`/`MatchingModule` — это они импортируют `ModerationModule`,
 * чтобы записывать задачи `unknown_model_code`/`unknown_screen_signature`/`unmatched_query`/
 * `ambiguous_query` (см. `detection.module.ts`, `matching.module.ts`). Обратная зависимость
 * привела бы к циклу; подсказки по имени (`SuggestionsService`) поэтому не используют
 * `MatchingService`, а вызывают те же пакеты (`text-normalizer`, `fuzzy-matcher`) независимо.
 */
@Module({
  imports: [
    CatalogModule,
    ScreenSignatureModule,
    MongooseModule.forFeature([
      { name: MODERATION_TASK_MODEL_NAME, schema: moderationTaskMongooseSchema },
      { name: CATALOG_CHANGE_MODEL_NAME, schema: catalogChangeMongooseSchema },
      { name: CATALOG_OVERRIDE_MODEL_NAME, schema: catalogOverrideMongooseSchema },
      { name: DEVICE_MODEL_NAME, schema: deviceMongooseSchema },
      { name: SCREEN_SIGNATURE_MODEL_NAME, schema: screenSignatureMongooseSchema },
    ]),
  ],
  controllers: [ModerationTasksController, AdminCatalogController],
  providers: [
    ModerationTaskService,
    CatalogChangeLogService,
    CatalogWriteService,
    ModerationResolutionService,
    SuggestionsService,
    AdminDeviceQueryService,
    CatalogStatsService,
    CatalogReloadService,
    normalizationDictionaryProvider,
  ],
  exports: [ModerationTaskService],
})
export class ModerationModule {}

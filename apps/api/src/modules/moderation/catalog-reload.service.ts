import { Injectable } from '@nestjs/common';

import { ScreenSignatureService } from '../detection/ios/screen-signature.service';
import { CatalogService } from '../catalog/catalog.service';

export interface ReloadResult {
  readonly deviceCount: number;
  readonly screenSignatureReady: boolean;
}

/**
 * `POST /api/v1/admin/catalog/reload` (docs/15-moderation.md §15.8: «перечитывание кэша
 * справочника без перезапуска»). Решение по пункту 8 передачи агента 6.6/431bd8d, зафиксировано
 * ADR (docs/09-decisions.md): эндпоинт перечитывает ОБА кэша, читающих MongoDB в `onModuleInit` —
 * `CatalogService` (`devices`+`catalog_overrides`) И `ScreenSignatureService` (`screen_signatures`,
 * `ScreenSignatureService.reload()` уже был публичным, но не вызывался никем, кроме
 * `onModuleInit`, — этот сервис первый вызывающий код). Не запускает `tools/seed
 * rebuild-signatures`: этот эндпоинт — часть `apps/api`, а пересборка производной коллекции
 * `screen_signatures` из ВСЕХ `devices` целиком — операция инструмента командной строки
 * `tools/seed`, отдельного процесса с доступом к файлам `data/catalog/` (ADR-006), а не к
 * MongoDB-подключению самого API. Между точечными решениями модератора (`CatalogWriteService`
 * пересобирает ОДНУ запись сигнатуры сразу при каждом действии) и массовым повторным импортом
 * (`pnpm seed load && pnpm seed rebuild-signatures`, docs/07 §7.6) этот эндпоинт закрывает третий
 * случай: кто-то мог изменить `catalog_overrides`/`devices` напрямую в MongoDB (например,
 * повторным запуском `tools/seed load` при уже запущенном API) — тогда `reload()` подтягивает
 * решения модератора поверх новых данных без перезапуска контейнера.
 */
@Injectable()
export class CatalogReloadService {
  public constructor(
    private readonly catalogService: CatalogService,
    private readonly screenSignatureService: ScreenSignatureService,
  ) {}

  public async reload(): Promise<ReloadResult> {
    await Promise.all([this.catalogService.reload(), this.screenSignatureService.reload()]);
    return {
      deviceCount: this.catalogService.getMeta().deviceCount,
      screenSignatureReady: this.screenSignatureService.isReady(),
    };
  }
}

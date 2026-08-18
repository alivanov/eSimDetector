import { HttpStatus, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { CatalogOverride, Device } from '@esim-detector/contracts';
import { catalogOverrideSchema, deviceSchema } from '@esim-detector/contracts';
import type { Model } from 'mongoose';

import { ApiError } from '../../common/errors/api-error';
import { buildCatalogSnapshot, type CatalogMeta, type CatalogSnapshot } from './catalog.snapshot';
import { CATALOG_OVERRIDE_MODEL_NAME } from './schemas/catalog-override.schema';
import { DEVICE_MODEL_NAME } from './schemas/device.schema';

export type CatalogStatus = 'loading' | 'ready' | 'error';

/**
 * Единственная точка доступа к справочнику для остальных модулей (.cursor/rules/api-boundaries.mdc:
 * «Доступ к справочнику только через `CatalogModule`»). Загружает `devices` и `catalog_overrides`
 * из MongoDB, применяет слой решений модератора ПОСЛЕДНИМ (docs/14-catalog-ingestion.md §14.4
 * шаг 6) и строит индексы `fuzzy-matcher` (ADR-005: в памяти процесса) — прогрев выполняется при
 * старте приложения (`onModuleInit`), а не по первому запросу.
 *
 * Обращение к незагруженному справочнику (`getSnapshot`/`getMeta` до готовности либо при ошибке
 * прогрева) даёт `CATALOG_UNAVAILABLE` с кодом 503 (docs/06-api-contract.md §6.5) — а не
 * падение приложения: ошибка прогрева переводит сервис в состояние `error`, но не мешает
 * `apps/api` подняться (критерий готовности: «приложение поднимается на пустом справочнике и
 * не падает» распространяется и на сбои чтения справочника).
 */
@Injectable()
export class CatalogService implements OnModuleInit {
  private readonly logger = new Logger(CatalogService.name);
  private status: CatalogStatus = 'loading';
  private snapshot: CatalogSnapshot | undefined;

  public constructor(
    @InjectModel(DEVICE_MODEL_NAME) private readonly deviceModel: Model<Device>,
    @InjectModel(CATALOG_OVERRIDE_MODEL_NAME)
    private readonly overrideModel: Model<CatalogOverride>,
  ) {}

  public async onModuleInit(): Promise<void> {
    await this.reload();
  }

  /** Перегружает справочник из MongoDB и перестраивает индексы (docs/05 §5.2: MongoDB → кэш в памяти). */
  public async reload(): Promise<void> {
    try {
      const [rawDevices, rawOverrides] = await Promise.all([
        this.deviceModel.find().lean().exec(),
        this.overrideModel.find().lean().exec(),
      ]);

      const devices = rawDevices.map((raw) => deviceSchema.parse(raw));
      const overrides = rawOverrides.map((raw) => catalogOverrideSchema.parse(raw));

      this.snapshot = buildCatalogSnapshot(devices, overrides);
      this.status = 'ready';
      this.logger.log(`Справочник загружен: ${devices.length} записей`);
    } catch (error) {
      this.status = 'error';
      this.logger.error(
        'Не удалось загрузить справочник',
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  public getStatus(): CatalogStatus {
    return this.status;
  }

  public isReady(): boolean {
    return this.status === 'ready';
  }

  private requireSnapshot(): CatalogSnapshot {
    if (this.status !== 'ready' || this.snapshot === undefined) {
      throw new ApiError(
        'CATALOG_UNAVAILABLE',
        'Справочник не загружен (сервис ещё не готов)',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return this.snapshot;
  }

  /** Снимок справочника (индексы + карта устройств) — горячий путь для будущих `matching`/`detection`. */
  public getSnapshot(): CatalogSnapshot {
    return this.requireSnapshot();
  }

  /** `GET /api/v1/catalog/meta` (docs/06 §6.4): версия, число записей, дата обновления. */
  public getMeta(): CatalogMeta {
    return this.requireSnapshot().meta;
  }
}

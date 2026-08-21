import { HttpStatus, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { CatalogOverride, Device } from '@esim-detector/contracts';
import { catalogOverrideSchema, deviceSchema } from '@esim-detector/contracts';
import type { Model } from 'mongoose';
import type { ZodError } from 'zod';

import { ApiError } from '../../common/errors/api-error';
import { buildCatalogSnapshot, type CatalogMeta, type CatalogSnapshot } from './catalog.snapshot';
import { CATALOG_OVERRIDE_MODEL_NAME } from './schemas/catalog-override.schema';
import { DEVICE_MODEL_NAME } from './schemas/device.schema';

export type CatalogStatus = 'loading' | 'ready' | 'error';

/** Краткое человекочитаемое описание нарушений схемы для журнала (без полного дампа документа). */
function describeIssues(error: ZodError): string {
  return error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
}

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

  /**
   * Перегружает справочник из MongoDB и перестраивает индексы (docs/05 §5.2: MongoDB → кэш в
   * памяти).
   *
   * Отдельный документ, не прошедший разбор схемой, НЕ отменяет загрузку целиком (docs/09-decisions.md
   * ADR-044) — тот же принцип, который ADR-029 уже применяет к нарушению инварианта при импорте:
   * «нарушение карантинит запись, а не отменяет загрузку справочника целиком». Без этого одна
   * повреждённая запись в базе означала бы 503 на КАЖДЫЙ запрос сервиса, причём неустранимый
   * перезапуском: `onModuleInit` читает те же данные и падает так же.
   *
   * Устройство, чьё решение модератора (`catalog_overrides`) прочитать не удалось, исключается из
   * снимка ЦЕЛИКОМ, а не отдаётся с исходными значениями импорта: молча потерянное решение вернуло
   * бы пользователю ответ, который модератор уже исправил, а отсутствие записи даёт
   * `clarification_required` (AGENTS.md: ложный ответ дороже отсутствия ответа).
   *
   * `status: 'error'` остаётся за настоящими сбоями чтения (недоступная MongoDB), а не за
   * содержимым отдельных документов.
   */
  public async reload(): Promise<void> {
    try {
      const [rawDevices, rawOverrides] = await Promise.all([
        this.deviceModel.find().lean().exec(),
        this.overrideModel.find().lean().exec(),
      ]);

      const devices: Device[] = [];
      for (const raw of rawDevices) {
        const parsed = deviceSchema.safeParse(raw);
        if (parsed.success) {
          devices.push(parsed.data);
          continue;
        }
        this.logger.warn(
          `Запись справочника не прошла разбор схемой и пропущена: ${describeIssues(parsed.error)}`,
        );
      }

      const overrides: CatalogOverride[] = [];
      const excludedDeviceIds = new Set<string>();
      for (const raw of rawOverrides) {
        const parsed = catalogOverrideSchema.safeParse(raw);
        if (parsed.success) {
          overrides.push(parsed.data);
          continue;
        }
        if (typeof raw.deviceId === 'string' && raw.deviceId.length > 0) {
          excludedDeviceIds.add(raw.deviceId);
        }
        this.logger.warn(
          `Решение модератора не прошло разбор схемой, устройство "${String(raw.deviceId)}" ` +
            `исключено из справочника: ${describeIssues(parsed.error)}`,
        );
      }

      const usableDevices =
        excludedDeviceIds.size === 0
          ? devices
          : devices.filter((device) => !excludedDeviceIds.has(device._id));

      this.snapshot = buildCatalogSnapshot(usableDevices, overrides);
      this.status = 'ready';
      this.logger.log(`Справочник загружен: ${usableDevices.length} записей`);
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

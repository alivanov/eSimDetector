import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { ScreenSignatureRecord } from '@esim-detector/contracts';
import { parseScreenSignatureRecord } from '@esim-detector/contracts';
import type { Model } from 'mongoose';

import { SCREEN_SIGNATURE_MODEL_NAME } from '../../catalog/schemas/screen-signature.schema';

/**
 * Кэш коллекции `screen_signatures` в памяти процесса (docs/05-data-model.md, §5.5; ADR-005:
 * «горячий путь идёт через кэш в памяти, обращений к базе в нём нет»). Не расширяет
 * `CatalogService` (AGENTS.md: «не переписывай ... CatalogModule») — отдельный маленький сервис
 * этого модуля, переиспользующий ту же Mongoose-схему через собственную регистрацию
 * `MongooseModule.forFeature` (agent 3 экспортировал схему именно для этого, ADR-022 п.5).
 *
 * Коллекция пока пуста в реальном развёртывании (`tools/seed rebuild-signatures` не запускался
 * на полной выгрузке — см. состояние агента 4) — сервис обязан корректно работать и на пустом
 * кэше, отвечая `undefined` на любой запрос, а не падать.
 */
@Injectable()
export class ScreenSignatureService implements OnModuleInit {
  private readonly logger = new Logger(ScreenSignatureService.name);
  private cache = new Map<string, ScreenSignatureRecord>();
  private ready = false;

  public constructor(
    @InjectModel(SCREEN_SIGNATURE_MODEL_NAME)
    private readonly model: Model<ScreenSignatureRecord>,
  ) {}

  public async onModuleInit(): Promise<void> {
    await this.reload();
  }

  public async reload(): Promise<void> {
    try {
      const raw = await this.model.find().lean().exec();
      const records = raw.map((entry) => parseScreenSignatureRecord(entry));
      this.cache = new Map(records.map((record) => [record.signature, record]));
      this.ready = true;
      this.logger.log(`Сигнатуры экрана загружены: ${records.length} записей`);
    } catch (error) {
      this.ready = false;
      this.logger.error(
        'Не удалось загрузить сигнатуры экрана — ветка iOS будет использовать только правило по версии ОС',
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  public isReady(): boolean {
    return this.ready;
  }

  /** `undefined`, если сигнатура не найдена либо коллекция пуста/недоступна — не ошибка (ADR-003). */
  public getBySignature(signature: string): ScreenSignatureRecord | undefined {
    return this.cache.get(signature);
  }

  /**
   * Все загруженные записи (этап 7, docs/15-moderation.md §15.3: «по сигнатуре экрана —
   * показываются известные сигнатуры с наименьшим отличием») — модерации нужен перебор всей
   * коллекции для поиска ближайших сигнатур к неизвестной, `getBySignature` для этого не подходит
   * (точный поиск по одному ключу). Не расширяет резолюцию детекции — только читает уже
   * прогретый кэш этого сервиса.
   */
  public entries(): readonly ScreenSignatureRecord[] {
    return [...this.cache.values()];
  }
}

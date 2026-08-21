import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type {
  AmbiguousQueryPayload,
  CsvQuarantinePayload,
  ModerationTask,
  ModerationTaskKind,
  ModerationTaskStatus,
  Platform,
  SourceDisagreementPayload,
  UnknownScreenSignaturePayload,
  UnmatchedQueryPayload,
  UserFeedbackPayload,
} from '@esim-detector/contracts';
import { moderationTaskSchema } from '@esim-detector/contracts';
import type { Model } from 'mongoose';
import { isValidObjectId } from 'mongoose';

import { ApiError } from '../../common/errors/api-error';

import { guessBrandFromModelCode } from './brand-guess';
import { normalizeMongoId } from './normalize-mongo-id';
import { MODERATION_TASK_MODEL_NAME } from './schemas/moderation-task.schema';

export interface ListModerationTasksOptions {
  readonly kind?: ModerationTaskKind;
  readonly status?: ModerationTaskStatus;
  readonly page: number;
  readonly pageSize: number;
}

export interface ListModerationTasksResult {
  readonly items: readonly ModerationTask[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

/**
 * Очередь задач модерации (docs/15-moderation.md §15.2) — дедупликация со счётчиком обращений
 * по составному ключу `kind`+`key` (docs/05-data-model.md §5.7), сортировка по умолчанию по
 * частоте (§15.2: «специалист закрывает пробелы, затрагивающие наибольшее число пользователей,
 * первыми»). Каждый тип задачи (§15.2, семь строк таблицы) получает отдельный типизированный
 * метод записи — компилятор проверяет соответствие `payload` и `kind` вместо `Record<string, unknown>`.
 */
@Injectable()
export class ModerationTaskService {
  private readonly logger = new Logger(ModerationTaskService.name);

  public constructor(
    @InjectModel(MODERATION_TASK_MODEL_NAME) private readonly model: Model<ModerationTask>,
  ) {}

  /**
   * Запись задачи никогда не должна ломать основной ответ пользователю `/detect`/`/devices/search`
   * (симметрично `ResolutionLogService.record`, `apps/api/src/modules/resolution-log`): сбой
   * записи в очередь модерации логируется и проглатывается, а не приводит к ошибке эндпоинта,
   * вызвавшего запись задачи как побочный эффект.
   */
  private async upsert(kind: ModerationTaskKind, key: string, payload: unknown): Promise<void> {
    try {
      const now = new Date();
      await this.model.findOneAndUpdate(
        { kind, key },
        {
          $set: { payload, lastSeenAt: now },
          $inc: { occurrences: 1 },
          $setOnInsert: {
            kind,
            key,
            status: 'open',
            resolvedAt: null,
            resolvedBy: null,
            resolutionNote: null,
          },
        },
        { upsert: true },
      );
    } catch (error) {
      this.logger.warn(
        `Не удалось записать задачу модерации "${kind}"/"${key}" — ответ пользователю не затронут`,
        error instanceof Error ? error.message : undefined,
      );
    }
  }

  /** `platform` — только `android`/`harmonyos` на практике (ветка Android/HarmonyOS, docs/03 §3.4). */
  public async recordUnknownModelCode(code: string, platform: Platform): Promise<void> {
    const payload = { code, platform, brandGuess: guessBrandFromModelCode(code) };
    await this.upsert('unknown_model_code', code.trim().toUpperCase(), payload);
  }

  public async recordUnknownScreenSignature(payload: UnknownScreenSignaturePayload): Promise<void> {
    await this.upsert(
      'unknown_screen_signature',
      `${payload.signature}@${payload.zoomed ? 'zoomed' : 'normal'}`,
      payload,
    );
  }

  public async recordUnmatchedQuery(payload: UnmatchedQueryPayload): Promise<void> {
    await this.upsert('unmatched_query', payload.normalizedQuery, payload);
  }

  public async recordAmbiguousQuery(payload: AmbiguousQueryPayload): Promise<void> {
    await this.upsert('ambiguous_query', payload.normalizedQuery, payload);
  }

  public async recordCsvQuarantine(payload: CsvQuarantinePayload): Promise<void> {
    await this.upsert(
      'csv_quarantine',
      `${payload.code}:${payload.source}:${payload.batchId}:${payload.lineNumber}`,
      payload,
    );
  }

  public async recordSourceDisagreement(payload: SourceDisagreementPayload): Promise<void> {
    await this.upsert('source_disagreement', payload.deviceId, payload);
  }

  public async recordUserFeedback(payload: UserFeedbackPayload): Promise<void> {
    await this.upsert('user_feedback', payload.requestId, payload);
  }

  /**
   * Одна задача, которую не удалось разобрать схемой, не должна прятать от модератора ВСЮ очередь
   * (docs/09-decisions.md ADR-044): такая задача пропускается с предупреждением в журнал. Пропуск
   * безопасен — задача очереди не участвует в ответе пользователю, поэтому её отсутствие не может
   * дать ложный результат определения, в отличие от потерянного решения модератора
   * (`CatalogService.reload`, там такой документ исключает устройство целиком).
   *
   * `total` считается запросом `countDocuments` и поэтому включает пропущенные задачи — так
   * расхождение видно модератору в интерфейсе, а не маскируется подогнанным числом.
   */
  public async list(options: ListModerationTasksOptions): Promise<ListModerationTasksResult> {
    const filter: Record<string, unknown> = {};
    if (options.kind !== undefined) {
      filter['kind'] = options.kind;
    }
    if (options.status !== undefined) {
      filter['status'] = options.status;
    }

    const skip = (options.page - 1) * options.pageSize;
    const [rawItems, total] = await Promise.all([
      this.model
        .find(filter)
        .sort({ occurrences: -1, lastSeenAt: -1 })
        .skip(skip)
        .limit(options.pageSize)
        .lean()
        .exec(),
      this.model.countDocuments(filter).exec(),
    ]);

    const items: ModerationTask[] = [];
    for (const raw of rawItems) {
      const parsed = moderationTaskSchema.safeParse(normalizeMongoId(raw));
      if (parsed.success) {
        items.push(parsed.data);
        continue;
      }
      this.logger.warn(
        `Задача модерации не прошла разбор схемой и пропущена в выдаче очереди: ` +
          parsed.error.issues
            .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
            .join('; '),
      );
    }

    return { items, total, page: options.page, pageSize: options.pageSize };
  }

  /**
   * `id`, не являющийся 24-символьным hex, — не ошибка сервера: это тот же самый случай
   * «неизвестный идентификатор», что и настоящий, но отсутствующий `ObjectId` (docs/06 §6.5,
   * реестр ошибок; через интерфейс не воспроизводится, идентификатор всегда приходит из списка
   * задач, но контракт документирован и для прямых вызовов API). Без этой проверки Mongoose
   * бросает `CastError` внутри `findById`, который `ApiExceptionFilter` не распознаёт и отдаёт
   * как 500 `INTERNAL_ERROR` — тот же класс дефекта, что ADR-044 уже устранил для повреждённых
   * документов, но здесь причина не в данных, а во входном идентификаторе.
   */
  public async getByIdOrThrow(id: string): Promise<ModerationTask> {
    if (!isValidObjectId(id)) {
      throw new ApiError('TASK_NOT_FOUND', 'Задача модерации не найдена', HttpStatus.NOT_FOUND);
    }
    const raw = await this.model.findById(id).lean().exec();
    if (raw === null) {
      throw new ApiError('TASK_NOT_FOUND', 'Задача модерации не найдена', HttpStatus.NOT_FOUND);
    }
    const parsed = moderationTaskSchema.safeParse(normalizeMongoId(raw));
    if (!parsed.success) {
      throw new ApiError(
        'INTERNAL_ERROR',
        `Задача модерации "${id}" повреждена и не может быть разобрана схемой`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    return parsed.data;
  }

  public async markResolved(id: string, resolvedBy: string, note: string): Promise<void> {
    await this.model.findByIdAndUpdate(id, {
      $set: { status: 'resolved', resolvedAt: new Date(), resolvedBy, resolutionNote: note },
    });
  }

  public async markRejected(id: string, resolvedBy: string, note: string): Promise<void> {
    await this.model.findByIdAndUpdate(id, {
      $set: { status: 'rejected', resolvedAt: new Date(), resolvedBy, resolutionNote: note },
    });
  }
}

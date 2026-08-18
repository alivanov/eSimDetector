import { createHash } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Platform, ResultStatus } from '@esim-detector/contracts';
import type { Model } from 'mongoose';

import { RESOLUTION_LOG_MODEL_NAME, type ResolutionLogEntry } from './resolution-log.schema';

export interface RecordResolutionInput {
  readonly requestId: string;
  /** Сырые сигналы запроса — хешируются здесь, необезличенное значение в базу не попадает. */
  readonly signals: unknown;
  readonly platform: Platform;
  readonly status: ResultStatus;
  readonly confidence: number;
  readonly reasonCodes: readonly string[];
  readonly durationMs: number;
}

/**
 * Журнал резолюций (docs/05-data-model.md, §5.6) — обезличенный: хранит хеш сигнатуры сигналов,
 * а не сами сигналы (docs/02-architecture.md §2.7: «журнал хранит хеш сигнатуры, а не "сырые"
 * значения»). Запись не должна мешать основному ответу пользователю: сбой записи в журнал
 * логируется и проглатывается, а не приводит к ошибке `/detect` (журнал — вспомогательный
 * артефакт для анализа расхождений, а не часть контракта ответа).
 */
@Injectable()
export class ResolutionLogService {
  private readonly logger = new Logger(ResolutionLogService.name);

  public constructor(
    @InjectModel(RESOLUTION_LOG_MODEL_NAME) private readonly model: Model<ResolutionLogEntry>,
  ) {}

  public hashSignals(signals: unknown): string {
    return createHash('sha256')
      .update(JSON.stringify(signals ?? null))
      .digest('hex');
  }

  public async record(input: RecordResolutionInput): Promise<void> {
    try {
      await this.model.create({
        requestId: input.requestId,
        signalsHash: this.hashSignals(input.signals),
        platform: input.platform,
        status: input.status,
        confidence: input.confidence,
        reasonCodes: [...input.reasonCodes],
        durationMs: input.durationMs,
      });
    } catch (error) {
      this.logger.warn(
        `Не удалось записать resolution_logs для запроса ${input.requestId} — ответ пользователю не затронут`,
        error instanceof Error ? error.message : undefined,
      );
    }
  }
}

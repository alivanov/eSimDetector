import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { runEvalSuite, type EvalSuiteResult } from '@esim-detector/tools-eval';
import { isValidObjectId, type Model } from 'mongoose';

import { ApiError } from '../../common/errors/api-error';
import type { EnvConfig } from '../../config/env.schema';

import {
  EVAL_RUN_MODEL_NAME,
  type EvalRunDocument,
  type EvalRunPhase,
  type EvalRunProgress,
  type EvalRunRecord,
  type EvalRunStatus,
  type EvalRunSummary,
} from './schemas/eval-run.schema';

/** Инъекция раннера стенда — в тестах подменяется без HTTP к себе. */
export const EVAL_SUITE_RUNNER = Symbol('EVAL_SUITE_RUNNER');

export type EvalSuiteRunner = (options: {
  readonly baseUrl: string;
  readonly intervalMs: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly onProgress?: (progress: {
    readonly phase: 'detection' | 'matching';
    readonly completed: number;
    readonly total: number;
  }) => void | Promise<void>;
}) => Promise<EvalSuiteResult>;

export const defaultEvalSuiteRunner: EvalSuiteRunner = (options) =>
  runEvalSuite({
    baseUrl: options.baseUrl,
    intervalMs: options.intervalMs,
    headers: options.headers,
    writeToDisk: false,
    ...(options.onProgress !== undefined ? { onProgress: options.onProgress } : {}),
  });

export interface EvalRunDto {
  readonly id: string;
  readonly status: EvalRunStatus;
  readonly progress: EvalRunProgress;
  readonly summary: EvalRunSummary | null;
  readonly errorMessage: string | null;
  readonly startedAt: string;
  readonly finishedAt: string | null;
  readonly createdAt: string;
  readonly hasReport: boolean;
}

export interface ListEvalRunsResult {
  readonly items: readonly EvalRunDto[];
}

function toDto(doc: EvalRunDocument): EvalRunDto {
  const createdAt = doc.createdAt ?? doc.startedAt;
  return {
    id: String(doc._id),
    status: doc.status,
    progress: {
      completed: doc.progress.completed,
      total: doc.progress.total,
      phase: doc.progress.phase,
    },
    summary: doc.summary,
    errorMessage: doc.errorMessage,
    startedAt: doc.startedAt.toISOString(),
    finishedAt: doc.finishedAt?.toISOString() ?? null,
    createdAt: createdAt.toISOString(),
    hasReport: typeof doc.reportMarkdown === 'string' && doc.reportMarkdown.length > 0,
  };
}

/**
 * Асинхронные прогоны стенда оценки (план «Админка и главная» §1.3): запись в `eval_runs`,
 * HTTP на `127.0.0.1:${PORT}` с админ-токеном, отчёт в MongoDB.
 */
@Injectable()
export class EvalRunService {
  private readonly logger = new Logger(EvalRunService.name);

  public constructor(
    @InjectModel(EVAL_RUN_MODEL_NAME)
    private readonly model: Model<EvalRunRecord>,
    private readonly configService: ConfigService<EnvConfig, true>,
    @Inject(EVAL_SUITE_RUNNER) private readonly runner: EvalSuiteRunner,
  ) {}

  public async start(): Promise<EvalRunDto> {
    const running = await this.model.findOne({ status: 'running' }).exec();
    if (running !== null) {
      throw new ApiError(
        'EVAL_RUN_IN_PROGRESS',
        'Прогон стенда оценки уже выполняется; дождитесь завершения',
        HttpStatus.CONFLICT,
      );
    }

    const startedAt = new Date();
    const created = await this.model.create({
      status: 'running',
      progress: { completed: 0, total: 0, phase: null },
      summary: null,
      reportMarkdown: null,
      errorMessage: null,
      startedAt,
      finishedAt: null,
    });

    void this.executeRun(String(created._id));

    return toDto(created);
  }

  public async list(): Promise<ListEvalRunsResult> {
    const docs = await this.model.find().sort({ createdAt: -1 }).limit(50).exec();
    return { items: docs.map(toDto) };
  }

  public async getById(id: string): Promise<EvalRunDto> {
    const doc = await this.findByIdOrThrow(id);
    return toDto(doc);
  }

  public async getReportMarkdown(id: string): Promise<string> {
    const doc = await this.findByIdOrThrow(id);
    if (doc.status === 'running') {
      throw new ApiError(
        'EVAL_RUN_IN_PROGRESS',
        'Отчёт ещё не готов: прогон стенда оценки выполняется',
        HttpStatus.CONFLICT,
      );
    }
    if (typeof doc.reportMarkdown !== 'string' || doc.reportMarkdown.length === 0) {
      throw new ApiError(
        'EVAL_RUN_NOT_FOUND',
        'Отчёт прогона стенда оценки отсутствует',
        HttpStatus.NOT_FOUND,
      );
    }
    return doc.reportMarkdown;
  }

  private async findByIdOrThrow(id: string): Promise<EvalRunDocument> {
    if (!isValidObjectId(id)) {
      throw new ApiError(
        'EVAL_RUN_NOT_FOUND',
        'Прогон стенда оценки не найден',
        HttpStatus.NOT_FOUND,
      );
    }
    const doc = await this.model.findById(id).exec();
    if (doc === null) {
      throw new ApiError(
        'EVAL_RUN_NOT_FOUND',
        'Прогон стенда оценки не найден',
        HttpStatus.NOT_FOUND,
      );
    }
    return doc;
  }

  private async executeRun(id: string): Promise<void> {
    const port = this.configService.get('PORT', { infer: true });
    const adminToken = this.configService.get('ADMIN_TOKEN', { infer: true });
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      const result = await this.runner({
        baseUrl,
        intervalMs: 0,
        headers: adminToken.length > 0 ? { 'X-Admin-Token': adminToken } : {},
        onProgress: async (progress) => {
          const phase: EvalRunPhase = progress.phase;
          await this.model
            .updateOne(
              { _id: id, status: 'running' },
              {
                $set: {
                  progress: {
                    completed: progress.completed,
                    total: progress.total,
                    phase,
                  },
                },
              },
            )
            .exec();
        },
      });

      const summary: EvalRunSummary = {
        detectionFalsePositives: result.detectionFalsePositives,
        matchingFalsePositives: result.matchingFalsePositives,
        detectionTotal: result.detectionTotal,
        matchingTotal: result.matchingTotal,
        falsePositives: result.detectionFalsePositives + result.matchingFalsePositives,
      };

      await this.model
        .updateOne(
          { _id: id },
          {
            $set: {
              status: 'completed',
              summary,
              reportMarkdown: result.reportMarkdown,
              errorMessage: null,
              finishedAt: new Date(),
              progress: {
                completed: result.detectionTotal + result.matchingTotal,
                total: result.detectionTotal + result.matchingTotal,
                phase: 'matching',
              },
            },
          },
        )
        .exec();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Прогон стенда оценки ${id} завершился ошибкой: ${message}`);
      await this.model
        .updateOne(
          { _id: id },
          {
            $set: {
              status: 'failed',
              errorMessage: message,
              finishedAt: new Date(),
            },
          },
        )
        .exec();
    }
  }
}

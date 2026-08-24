import { ConfigService } from '@nestjs/config';
import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import { withTestDatabase, type TestDatabaseHandle } from '@esim-detector/test-utils';
import type { Model } from 'mongoose';

import type { EnvConfig } from '../../config/env.schema';
import { validateEnv } from '../../config/env.schema';

import { EVAL_SUITE_RUNNER, EvalRunService, type EvalSuiteRunner } from './eval-run.service';
import {
  EVAL_RUN_MODEL_NAME,
  evalRunMongooseSchema,
  type EvalRunRecord,
} from './schemas/eval-run.schema';

function buildConfig(): ConfigService<EnvConfig, true> {
  const env = validateEnv({
    NODE_ENV: 'test',
    PORT: 3000,
    ADMIN_TOKEN: 'test-admin-token',
    MONGODB_URI: 'mongodb://127.0.0.1:27017/unused_test',
  });
  return new ConfigService<EnvConfig, true>(env);
}

function waitFor(predicate: () => Promise<boolean>, timeoutMs = 2000): Promise<void> {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = (): void => {
      void predicate().then((ok) => {
        if (ok) {
          resolve();
          return;
        }
        if (Date.now() - started > timeoutMs) {
          reject(new Error('таймаут ожидания прогона'));
          return;
        }
        setTimeout(tick, 20);
      });
    };
    tick();
  });
}

/**
 * `EvalRunService` (план «Админка и главная» §1.3) на изолированной тестовой базе (ADR-017).
 * Раннер стенда подменяется — без сотен HTTP к живому API.
 */
describe('EvalRunService (интеграция, withTestDatabase)', () => {
  let db: TestDatabaseHandle;
  let moduleRef: TestingModule;
  let service: EvalRunService;
  let model: Model<EvalRunRecord>;
  let runner: jest.MockedFunction<EvalSuiteRunner>;

  beforeAll(async () => {
    db = await withTestDatabase('eval-run-service');
    runner = jest.fn();

    moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(db.uri),
        MongooseModule.forFeature([{ name: EVAL_RUN_MODEL_NAME, schema: evalRunMongooseSchema }]),
      ],
      providers: [
        EvalRunService,
        { provide: ConfigService, useValue: buildConfig() },
        { provide: EVAL_SUITE_RUNNER, useValue: runner },
      ],
    }).compile();

    service = moduleRef.get(EvalRunService);
    model = moduleRef.get(getModelToken(EVAL_RUN_MODEL_NAME));
  });

  afterEach(async () => {
    await db.truncateAll();
    runner.mockReset();
  });

  afterAll(async () => {
    await moduleRef.close();
    await db.close();
  });

  it('start создаёт running-прогон и отказывает повторным стартом с 409', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    runner.mockImplementation(async (options) => {
      if (options.onProgress !== undefined) {
        await options.onProgress({ phase: 'detection', completed: 1, total: 2 });
      }
      await gate;
      return {
        detectionFalsePositives: 0,
        matchingFalsePositives: 0,
        detectionTotal: 1,
        matchingTotal: 1,
        reportMarkdown: '# отчёт\n',
      };
    });

    const first = await service.start();
    expect(first.status).toBe('running');
    expect(runner).toHaveBeenCalled();

    let caught: unknown;
    try {
      await service.start();
    } catch (error) {
      caught = error;
    }
    expect((caught as { code?: string }).code).toBe('EVAL_RUN_IN_PROGRESS');
    expect((caught as { getStatus?: () => number }).getStatus?.()).toBe(409);

    release();
    await waitFor(async () => (await service.getById(first.id)).status === 'completed');

    const completed = await service.getById(first.id);
    expect(completed.status).toBe('completed');
    expect(completed.hasReport).toBe(true);
    expect(completed.summary?.falsePositives).toBe(0);

    const report = await service.getReportMarkdown(first.id);
    expect(report).toContain('# отчёт');
  });

  it('list возвращает прогоны; неизвестный id — EVAL_RUN_NOT_FOUND', async () => {
    runner.mockResolvedValue({
      detectionFalsePositives: 0,
      matchingFalsePositives: 0,
      detectionTotal: 1,
      matchingTotal: 1,
      reportMarkdown: '# ok\n',
    });

    const started = await service.start();
    await waitFor(async () => (await service.getById(started.id)).status === 'completed');

    const listed = await service.list();
    expect(listed.items.length).toBe(1);

    let caught: unknown;
    try {
      await service.getById('000000000000000000000000');
    } catch (error) {
      caught = error;
    }
    expect((caught as { code?: string }).code).toBe('EVAL_RUN_NOT_FOUND');
  });

  it('ошибка раннера помечает прогон как failed', async () => {
    runner.mockRejectedValue(new Error('стенд недоступен'));

    const started = await service.start();
    await waitFor(async () => (await service.getById(started.id)).status === 'failed');

    const failed = await service.getById(started.id);
    expect(failed.status).toBe('failed');
    expect(failed.errorMessage).toBe('стенд недоступен');

    const count = await model.countDocuments().exec();
    expect(count).toBe(1);
  });
});

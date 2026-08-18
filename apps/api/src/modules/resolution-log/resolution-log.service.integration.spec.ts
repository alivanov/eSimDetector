import { withTestDatabase, type TestDatabaseHandle } from '@esim-detector/test-utils';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Model } from 'mongoose';

import { ResolutionLogModule } from './resolution-log.module';
import { RESOLUTION_LOG_MODEL_NAME, type ResolutionLogEntry } from './resolution-log.schema';
import { ResolutionLogService } from './resolution-log.service';

describe('ResolutionLogService (интеграция, withTestDatabase)', () => {
  let db: TestDatabaseHandle;
  let moduleRef: TestingModule;
  let service: ResolutionLogService;
  let model: Model<ResolutionLogEntry>;

  beforeAll(async () => {
    db = await withTestDatabase('resolution-log-service');
    moduleRef = await Test.createTestingModule({
      imports: [MongooseModule.forRoot(db.uri), ResolutionLogModule],
    }).compile();

    service = moduleRef.get(ResolutionLogService);
    model = moduleRef.get<Model<ResolutionLogEntry>>(getModelToken(RESOLUTION_LOG_MODEL_NAME));
  });

  afterEach(async () => {
    await db.truncateAll();
  });

  afterAll(async () => {
    await moduleRef.close();
    await db.close();
  });

  it('сохраняет запись с хешем сигналов, а не сырыми сигналами (обезличенность, docs/05 §5.6)', async () => {
    const signals = { userAgent: 'Mozilla/5.0 (iPhone)', uaData: { model: 'SM-S928B' } };

    await service.record({
      requestId: 'req-1',
      signals,
      platform: 'android',
      status: 'supported',
      confidence: 0.95,
      reasonCodes: ['UA_CH_MODEL_RECEIVED', 'CATALOG_EXACT_MATCH'],
      durationMs: 12,
    });

    const stored = await model.findOne({ requestId: 'req-1' }).lean().exec();
    expect(stored).toMatchObject({
      requestId: 'req-1',
      platform: 'android',
      status: 'supported',
      confidence: 0.95,
      reasonCodes: ['UA_CH_MODEL_RECEIVED', 'CATALOG_EXACT_MATCH'],
      durationMs: 12,
    });
    expect(stored?.signalsHash).toBe(service.hashSignals(signals));
    expect(JSON.stringify(stored)).not.toContain('SM-S928B');
  });

  it('hashSignals — детерминированная функция одного и того же объекта', () => {
    const signals = { userAgent: 'abc' };
    expect(service.hashSignals(signals)).toBe(service.hashSignals({ userAgent: 'abc' }));
  });

  it('различные сигналы дают разные хеши', () => {
    expect(service.hashSignals({ userAgent: 'a' })).not.toBe(
      service.hashSignals({ userAgent: 'b' }),
    );
  });

  it('сбой записи (например, невалидный enum платформы) не выбрасывает исключение наружу', async () => {
    await expect(
      service.record({
        requestId: 'req-broken',
        signals: {},
        // @ts-expect-error — намеренно недопустимое значение enum для проверки отказоустойчивости
        platform: 'not-a-real-platform',
        status: 'supported',
        confidence: 1,
        reasonCodes: [],
        durationMs: 1,
      }),
    ).resolves.toBeUndefined();
  });
});

import type { ModerationTask } from '@esim-detector/contracts';
import { withTestDatabase, type TestDatabaseHandle } from '@esim-detector/test-utils';
import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Model } from 'mongoose';

import { ModerationTaskService } from './moderation-task.service';
import {
  MODERATION_TASK_MODEL_NAME,
  moderationTaskMongooseSchema,
} from './schemas/moderation-task.schema';

/**
 * Дедупликация очереди задач (docs/15-moderation.md §15.2: «повторное обращение увеличивает
 * счётчик, а не создаёт новую запись») на изолированной тестовой базе (ADR-017).
 */
describe('ModerationTaskService (интеграция, withTestDatabase)', () => {
  let db: TestDatabaseHandle;
  let moduleRef: TestingModule;
  let service: ModerationTaskService;
  let model: Model<ModerationTask>;

  beforeAll(async () => {
    db = await withTestDatabase('moderation-task-service');
    moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(db.uri),
        MongooseModule.forFeature([
          { name: MODERATION_TASK_MODEL_NAME, schema: moderationTaskMongooseSchema },
        ]),
      ],
      providers: [ModerationTaskService],
    }).compile();

    service = moduleRef.get(ModerationTaskService);
    model = moduleRef.get<Model<ModerationTask>>(getModelToken(MODERATION_TASK_MODEL_NAME));
  });

  afterEach(async () => {
    await db.truncateAll();
  });

  afterAll(async () => {
    await moduleRef.close();
    await db.close();
  });

  it('повторный unknown_model_code с тем же кодом увеличивает occurrences, а не создаёт вторую задачу', async () => {
    await service.recordUnknownModelCode('SM-S9280', 'android');
    await service.recordUnknownModelCode('sm-s9280', 'android');
    await service.recordUnknownModelCode('SM-S9280', 'android');

    const result = await service.list({ page: 1, pageSize: 10 });
    expect(result.total).toBe(1);
    expect(result.items[0]?.occurrences).toBe(3);
  });

  it('разные коды заводят разные задачи; список отсортирован по occurrences по умолчанию', async () => {
    await service.recordUnknownModelCode('SM-AAA', 'android');
    await service.recordUnknownModelCode('SM-BBB', 'android');
    await service.recordUnknownModelCode('SM-BBB', 'android');

    const result = await service.list({ page: 1, pageSize: 10 });
    expect(result.total).toBe(2);
    expect(result.items[0]?.occurrences).toBe(2);
    expect(result.items[1]?.occurrences).toBe(1);
  });

  it('фильтр по status="open" не показывает задачи после markResolved', async () => {
    await service.recordUnmatchedQuery({ rawQuery: 'айфон 20', normalizedQuery: 'iphone 20' });
    const [task] = (await service.list({ page: 1, pageSize: 10 })).items;
    if (task === undefined) {
      throw new Error('задача не создана');
    }

    await service.markResolved(task._id, 'moderator-1', 'решено вручную');

    const openTasks = await service.list({ status: 'open', page: 1, pageSize: 10 });
    expect(openTasks.total).toBe(0);

    const resolvedTasks = await service.list({ status: 'resolved', page: 1, pageSize: 10 });
    expect(resolvedTasks.total).toBe(1);
    expect(resolvedTasks.items[0]?.status).toBe('resolved');
    expect(resolvedTasks.items[0]?.resolvedBy).toBe('moderator-1');
  });

  it('getByIdOrThrow бросает TASK_NOT_FOUND на несуществующем идентификаторе', async () => {
    await expect(service.getByIdOrThrow('000000000000000000000000')).rejects.toThrow(
      'Задача модерации не найдена',
    );
  });

  it('markRejected переводит задачу в статус rejected с обоснованием и автором', async () => {
    await service.recordUnmatchedQuery({ rawQuery: 'айфон 20', normalizedQuery: 'iphone 20' });
    const [task] = (await service.list({ page: 1, pageSize: 10 })).items;
    if (task === undefined) {
      throw new Error('задача не создана');
    }

    await service.markRejected(task._id, 'moderator-1', 'дубликат другой задачи');

    const rejected = await service.getByIdOrThrow(task._id);
    expect(rejected.status).toBe('rejected');
    expect(rejected.resolvedBy).toBe('moderator-1');
    expect(rejected.resolutionNote).toBe('дубликат другой задачи');
  });

  it('getByIdOrThrow бросает INTERNAL_ERROR на повреждённом документе (не проходит разбор схемой)', async () => {
    await new model({
      kind: 'user_feedback',
      key: 'req-corrupted',
      payload: {
        requestId: 'req-corrupted',
        reportedStatus: 'supported',
        deviceId: null,
        comment: '',
        signalsSummary: null,
      },
      occurrences: 1,
      status: 'open',
      lastSeenAt: new Date(),
    }).save({ validateBeforeSave: false });
    const [corrupted] = await model.find({ key: 'req-corrupted' }).lean().exec();
    if (corrupted === undefined) {
      throw new Error('тестовый документ не создан');
    }

    await expect(service.getByIdOrThrow(String(corrupted._id))).rejects.toThrow('повреждена');
  });

  it('getByIdOrThrow бросает TASK_NOT_FOUND (а не 500 от Mongoose CastError) на идентификаторе неверного формата', async () => {
    let error: unknown;
    try {
      await service.getByIdOrThrow('not-a-valid-id');
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(Error);
    expect((error as { message: string }).message).toBe('Задача модерации не найдена');
    expect((error as { code?: string }).code).toBe('TASK_NOT_FOUND');
  });

  it('повреждённая задача пропускается в выдаче, а не обрушивает всю очередь (ADR-044)', async () => {
    await service.recordUnknownModelCode('SM-DDD', 'android');
    // Задача с пустым `comment` — ровно то, что до ADR-044 мог создать анонимный клиент через
    // публичный POST /api/v1/feedback: схема `userFeedbackPayloadSchema` такой документ не
    // принимает, и одна такая запись прятала от модератора очередь целиком.
    await new model({
      kind: 'user_feedback',
      key: 'req-broken',
      payload: {
        requestId: 'req-broken',
        reportedStatus: 'supported',
        deviceId: null,
        comment: '',
        signalsSummary: null,
      },
      occurrences: 1,
      status: 'open',
      lastSeenAt: new Date(),
    }).save({ validateBeforeSave: false });

    const result = await service.list({ page: 1, pageSize: 10 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.kind).toBe('unknown_model_code');
    // `total` считается запросом к базе и включает пропущенную задачу — расхождение видно, а не
    // маскируется подогнанным числом.
    expect(result.total).toBe(2);
  });

  it('recordUnknownScreenSignature заводит задачу с ключом, различающим zoomed/normal', async () => {
    await service.recordUnknownScreenSignature({
      signature: '375x812@3',
      cssWidth: 375,
      cssHeight: 812,
      dpr: 3,
      zoomed: false,
      osVersion: '17.5',
    });
    await service.recordUnknownScreenSignature({
      signature: '375x812@3',
      cssWidth: 375,
      cssHeight: 812,
      dpr: 3,
      zoomed: true,
      osVersion: '17.5',
    });

    const result = await service.list({ kind: 'unknown_screen_signature', page: 1, pageSize: 10 });
    expect(result.total).toBe(2);
  });

  it('recordAmbiguousQuery/recordCsvQuarantine/recordSourceDisagreement/recordUserFeedback заводят свои типы задач', async () => {
    await service.recordAmbiguousQuery({
      rawQuery: 'galaxy s23',
      normalizedQuery: 'galaxy s23',
      candidateIds: ['samsung-galaxy-s23', 'samsung-galaxy-s23-plus'],
    });
    await service.recordCsvQuarantine({
      code: 'CODE_COLLISION',
      source: 'gpt-5-6-luna',
      batchId: '02',
      lineNumber: 5,
      detail: 'дублирующийся код',
    });
    await service.recordSourceDisagreement({
      deviceId: 'samsung-galaxy-a54',
      variants: [
        { source: 'llm-model-a', esimSupport: 'yes' },
        { source: 'llm-model-b', esimSupport: 'no' },
      ],
    });
    await service.recordUserFeedback({
      requestId: 'req-1',
      reportedStatus: 'supported',
      deviceId: null,
      comment: 'неверно',
      signalsSummary: null,
    });

    const kinds = [
      'ambiguous_query',
      'csv_quarantine',
      'source_disagreement',
      'user_feedback',
    ] as const;
    for (const kind of kinds) {
      const result = await service.list({ kind, page: 1, pageSize: 10 });
      expect(result.total).toBe(1);
    }
  });

  it('фильтр по kind сужает выдачу', async () => {
    await service.recordUnknownModelCode('SM-CCC', 'android');
    await service.recordUnmatchedQuery({ rawQuery: 'айфон 20', normalizedQuery: 'iphone 20' });

    const result = await service.list({ kind: 'unknown_model_code', page: 1, pageSize: 10 });
    expect(result.total).toBe(1);
    expect(result.items[0]?.kind).toBe('unknown_model_code');
  });
});

import { withTestDatabase, type TestDatabaseHandle } from '@esim-detector/test-utils';
import { MongooseModule } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';

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

  it('фильтр по kind сужает выдачу', async () => {
    await service.recordUnknownModelCode('SM-CCC', 'android');
    await service.recordUnmatchedQuery({ rawQuery: 'айфон 20', normalizedQuery: 'iphone 20' });

    const result = await service.list({ kind: 'unknown_model_code', page: 1, pageSize: 10 });
    expect(result.total).toBe(1);
    expect(result.items[0]?.kind).toBe('unknown_model_code');
  });
});

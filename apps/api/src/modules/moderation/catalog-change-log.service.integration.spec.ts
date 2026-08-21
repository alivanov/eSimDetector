import { withTestDatabase, type TestDatabaseHandle } from '@esim-detector/test-utils';
import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Model } from 'mongoose';
import type { CatalogChangeEntry } from '@esim-detector/contracts';

import { CatalogChangeLogService } from './catalog-change-log.service';
import {
  CATALOG_CHANGE_MODEL_NAME,
  catalogChangeMongooseSchema,
} from './schemas/catalog-change.schema';

/**
 * `CatalogChangeLogService` (docs/15-moderation.md §15.6) — журнал изменений только для чтения.
 * Отдельный тест на изолированной базе (ADR-017): до этого файла сервис проверялся только
 * косвенно через `CatalogWriteService`/контроллер, поэтому фильтр по `deviceId` в `list()` не
 * был покрыт обеими ветками (docs/09-decisions.md ADR-047 п.10 — доведение покрытия `moderation`
 * до документированного значения docs/08 §8.2).
 */
describe('CatalogChangeLogService (интеграция, withTestDatabase)', () => {
  let db: TestDatabaseHandle;
  let moduleRef: TestingModule;
  let service: CatalogChangeLogService;
  let model: Model<CatalogChangeEntry>;

  beforeAll(async () => {
    db = await withTestDatabase('catalog-change-log-service');
    moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(db.uri),
        MongooseModule.forFeature([
          { name: CATALOG_CHANGE_MODEL_NAME, schema: catalogChangeMongooseSchema },
        ]),
      ],
      providers: [CatalogChangeLogService],
    }).compile();

    service = moduleRef.get(CatalogChangeLogService);
    model = moduleRef.get<Model<CatalogChangeEntry>>(getModelToken(CATALOG_CHANGE_MODEL_NAME));
  });

  afterEach(async () => {
    await db.truncateAll();
  });

  afterAll(async () => {
    await moduleRef.close();
    await db.close();
  });

  it('append пишет запись с createdAt, заполняемым сервисом', async () => {
    await service.append({
      deviceId: 'samsung-galaxy-s24-ultra',
      taskId: 'task-1',
      action: 'link_model_code',
      field: 'modelCodes',
      previousValue: ['SM-S928B'],
      newValue: ['SM-S928B', 'SM-S9280'],
      reason: 'привязка кода',
      decidedBy: 'moderator-1',
    });

    const raw = await model.findOne({ deviceId: 'samsung-galaxy-s24-ultra' }).lean().exec();
    expect(raw?.createdAt).toBeInstanceOf(Date);
  });

  it('list без deviceId отдаёт все записи журнала', async () => {
    await service.append({
      deviceId: 'device-a',
      taskId: null,
      action: 'create_device',
      field: null,
      previousValue: null,
      newValue: null,
      reason: 'создано вручную',
      decidedBy: 'moderator-1',
    });
    await service.append({
      deviceId: 'device-b',
      taskId: null,
      action: 'create_device',
      field: null,
      previousValue: null,
      newValue: null,
      reason: 'создано вручную',
      decidedBy: 'moderator-1',
    });

    const result = await service.list({ page: 1, pageSize: 20 });

    expect(result.total).toBe(2);
    expect(result.items.map((item) => item.deviceId).sort()).toEqual(['device-a', 'device-b']);
  });

  it('list с deviceId сужает выдачу до конкретной записи справочника', async () => {
    await service.append({
      deviceId: 'device-a',
      taskId: null,
      action: 'create_device',
      field: null,
      previousValue: null,
      newValue: null,
      reason: 'создано вручную',
      decidedBy: 'moderator-1',
    });
    await service.append({
      deviceId: 'device-b',
      taskId: null,
      action: 'create_device',
      field: null,
      previousValue: null,
      newValue: null,
      reason: 'создано вручную',
      decidedBy: 'moderator-1',
    });

    const result = await service.list({ deviceId: 'device-a', page: 1, pageSize: 20 });

    expect(result.total).toBe(1);
    expect(result.items[0]?.deviceId).toBe('device-a');
  });

  it('постраничность: page/pageSize ограничивают выдачу и возвращаются в результате', async () => {
    for (let i = 0; i < 3; i += 1) {
      await service.append({
        deviceId: `device-${i}`,
        taskId: null,
        action: 'create_device',
        field: null,
        previousValue: null,
        newValue: null,
        reason: 'создано вручную',
        decidedBy: 'moderator-1',
      });
    }

    const result = await service.list({ page: 2, pageSize: 2 });

    expect(result.total).toBe(3);
    expect(result.items).toHaveLength(1);
    expect(result.page).toBe(2);
    expect(result.pageSize).toBe(2);
  });
});

import type { CatalogOverride, Device } from '@esim-detector/contracts';
import { buildSampleDevice } from '@esim-detector/contracts';
import { withTestDatabase, type TestDatabaseHandle } from '@esim-detector/test-utils';
import { TestingModule, Test } from '@nestjs/testing';
import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import { lookupModelCode } from '@esim-detector/fuzzy-matcher';
import type { Model } from 'mongoose';

import { CatalogModule } from './catalog.module';
import { CatalogService } from './catalog.service';
import { mapDeviceToMatcherDevice } from './catalog.snapshot';
import { CATALOG_OVERRIDE_MODEL_NAME } from './schemas/catalog-override.schema';
import { DEVICE_MODEL_NAME } from './schemas/device.schema';

/**
 * Интеграционный тест `CatalogModule` на изолированной тестовой базе (`withTestDatabase()`,
 * ADR-017) — единственный способ проверить прогрев кэша и построение индексов на РЕАЛЬНОМ
 * подключении Mongoose, а не на подставных значениях. Никаких переменных окружения не читает
 * (`process.env['MONGODB_URI']` в тестах не используется — адрес выдаёт поднятый экземпляр).
 */
describe('CatalogModule (интеграция, withTestDatabase)', () => {
  let db: TestDatabaseHandle;
  let moduleRef: TestingModule;
  let catalogService: CatalogService;
  let deviceModel: Model<Device>;
  let overrideModel: Model<CatalogOverride>;

  beforeAll(async () => {
    db = await withTestDatabase('catalog-module-integration');

    moduleRef = await Test.createTestingModule({
      imports: [MongooseModule.forRoot(db.uri), CatalogModule],
    }).compile();

    deviceModel = moduleRef.get<Model<Device>>(getModelToken(DEVICE_MODEL_NAME));
    overrideModel = moduleRef.get<Model<CatalogOverride>>(
      getModelToken(CATALOG_OVERRIDE_MODEL_NAME),
    );
  });

  afterEach(async () => {
    await db.truncateAll();
  });

  afterAll(async () => {
    await moduleRef.close();
    await db.close();
  });

  it('загружает справочник из MongoDB, строит индексы и делает CatalogService готовым', async () => {
    await deviceModel.create(buildSampleDevice({ _id: 'samsung-galaxy-s24-ultra' }));

    catalogService = moduleRef.get(CatalogService);
    await catalogService.reload();

    expect(catalogService.isReady()).toBe(true);
    expect(catalogService.getMeta().deviceCount).toBe(1);

    const snapshot = catalogService.getSnapshot();
    const device = snapshot.devices.get('samsung-galaxy-s24-ultra');
    expect(device).toBeDefined();
    expect(lookupModelCode(snapshot.matchIndex.aliasIndex, 'SM-S928B')).toEqual(
      device !== undefined ? mapDeviceToMatcherDevice(device) : undefined,
    );
  });

  it('применяет catalog_overrides поверх записи импорта (docs/14 §14.4 шаг 6)', async () => {
    await deviceModel.create(
      buildSampleDevice({
        _id: 'apple-iphone-x',
        esim: {
          support: 'not_supported',
          dualSim: 'none',
          maxProfiles: null,
          conditions: [],
          clarifyingQuestion: null,
          notes: '',
        },
        dataConfidence: 'derived',
      }),
    );
    await overrideModel.create({
      deviceId: 'apple-iphone-x',
      patch: { esim: { support: 'supported' }, dataConfidence: 'verified' },
      reason: 'подтверждено модератором вручную по вендорской документации',
      decidedBy: 'moderator-1',
      decidedAt: new Date(),
    });

    catalogService = moduleRef.get(CatalogService);
    await catalogService.reload();

    const device = catalogService.getSnapshot().devices.get('apple-iphone-x');
    expect(device?.esim.support).toBe('supported');
    expect(device?.dataConfidence).toBe('verified');
  });

  it('на пустом справочнике (без документов) готов с нулевым числом записей', async () => {
    catalogService = moduleRef.get(CatalogService);
    await catalogService.reload();

    expect(catalogService.isReady()).toBe(true);
    expect(catalogService.getMeta()).toMatchObject({ deviceCount: 0, updatedAt: null });
  });

  it('переходит в статус error и бросает CATALOG_UNAVAILABLE, если запись не проходит валидацию contracts при загрузке', async () => {
    // Сохранение с отключённой валидацией Mongoose — единственный способ воспроизвести
    // рассинхронизацию данных, которую должна поймать `deviceSchema.parse` внутри
    // `CatalogService.reload()` (защита независимо от валидации на пути записи).
    await new deviceModel({ _id: 'broken-device', brand: 'test' }).save({
      validateBeforeSave: false,
    });

    catalogService = moduleRef.get(CatalogService);
    await catalogService.reload();

    expect(catalogService.getStatus()).toBe('error');
    expect(catalogService.isReady()).toBe(false);
    expect(() => catalogService.getMeta()).toThrow('Справочник не загружен');
    expect(() => catalogService.getSnapshot()).toThrow('Справочник не загружен');
  });

  it('getMeta()/getSnapshot() бросают до первого reload() (статус "loading")', async () => {
    const freshDb = await withTestDatabase('catalog-module-loading-state');
    try {
      const freshModuleRef = await Test.createTestingModule({
        imports: [MongooseModule.forRoot(freshDb.uri), CatalogModule],
      }).compile();
      const freshCatalogService = freshModuleRef.get(CatalogService);

      expect(freshCatalogService.getStatus()).toBe('loading');
      expect(() => freshCatalogService.getMeta()).toThrow('Справочник не загружен');

      await freshModuleRef.close();
    } finally {
      await freshDb.close();
    }
  });

  it('прогревается автоматически при старте модуля (onModuleInit), без явного reload()', async () => {
    const warmupDb = await withTestDatabase('catalog-module-warmup');
    try {
      const warmupModuleRef = await Test.createTestingModule({
        imports: [MongooseModule.forRoot(warmupDb.uri), CatalogModule],
      }).compile();

      // Документ создаётся ДО .init() напрямую через модель — тест утверждает, что onModuleInit
      // сам загрузит справочник (ADR-005: «прогрев при старте», а не по первому запросу).
      const warmupDeviceModel = warmupModuleRef.get<Model<Device>>(
        getModelToken(DEVICE_MODEL_NAME),
      );
      await warmupDeviceModel.create(buildSampleDevice({ _id: 'warmup-device' }));

      await warmupModuleRef.init();

      const warmupCatalogService = warmupModuleRef.get(CatalogService);
      expect(warmupCatalogService.isReady()).toBe(true);
      expect(warmupCatalogService.getSnapshot().devices.has('warmup-device')).toBe(true);

      await warmupModuleRef.close();
    } finally {
      await warmupDb.close();
    }
  });
});

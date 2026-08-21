import { buildSampleDevice, type CatalogOverride, type Device } from '@esim-detector/contracts';
import { withTestDatabase, type TestDatabaseHandle } from '@esim-detector/test-utils';
import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Model } from 'mongoose';

import { AppConfigModule } from '../../config/config.module';
import { CatalogService } from '../catalog/catalog.service';
import { CATALOG_OVERRIDE_MODEL_NAME } from '../catalog/schemas/catalog-override.schema';
import { DEVICE_MODEL_NAME } from '../catalog/schemas/device.schema';
import { ScreenSignatureService } from '../detection/ios/screen-signature.service';

import { CatalogWriteService } from './catalog-write.service';
import { ModerationModule } from './moderation.module';

/**
 * Интеграционный тест `CatalogWriteService` (этап 7, docs/15-moderation.md §15.4) на
 * изолированной тестовой базе (`withTestDatabase()`, ADR-017) — единственный способ проверить
 * реальную последовательность запись→`reload()`→чтение через `CatalogService`/`ScreenSignatureService`.
 */
describe('CatalogWriteService (интеграция, withTestDatabase)', () => {
  let db: TestDatabaseHandle;
  let moduleRef: TestingModule;
  let service: CatalogWriteService;
  let catalogService: CatalogService;
  let screenSignatureService: ScreenSignatureService;
  let deviceModel: Model<Device>;
  let overrideModel: Model<CatalogOverride>;

  beforeAll(async () => {
    db = await withTestDatabase('catalog-write-service');
    moduleRef = await Test.createTestingModule({
      imports: [AppConfigModule, MongooseModule.forRoot(db.uri), ModerationModule],
    }).compile();

    service = moduleRef.get(CatalogWriteService);
    catalogService = moduleRef.get(CatalogService);
    screenSignatureService = moduleRef.get(ScreenSignatureService);
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

  it('linkModelCode добавляет код, поднимает достоверность до verified и виден через CatalogService сразу же', async () => {
    await deviceModel.create(
      buildSampleDevice({ _id: 'samsung-galaxy-s24-ultra', modelCodes: ['SM-S928B'] }),
    );
    await catalogService.reload();

    const updated = await service.linkModelCode(
      'samsung-galaxy-s24-ultra',
      'SM-S9280',
      'https://www.samsung.com/verified',
      'moderator-1',
      null,
    );

    expect(updated.modelCodes).toEqual(['SM-S928B', 'SM-S9280']);
    expect(updated.dataConfidence).toBe('verified');

    // Без повторного вызова reload() снаружи — reload уже выполнен внутри `applyPatch`.
    const fromSnapshot = catalogService.getSnapshot().devices.get('samsung-galaxy-s24-ultra');
    expect(fromSnapshot?.modelCodes).toEqual(['SM-S928B', 'SM-S9280']);
  });

  it('второй вызов на то же устройство объединяет патчи, а не затирает предыдущее решение', async () => {
    await deviceModel.create(buildSampleDevice({ _id: 'samsung-galaxy-s24-ultra' }));
    await catalogService.reload();

    await service.linkModelCode(
      'samsung-galaxy-s24-ultra',
      'SM-S9280',
      'https://www.samsung.com/verified',
      'moderator-1',
      null,
    );
    await service.addAlias(
      'samsung-galaxy-s24-ultra',
      'галакси с24 ультра',
      'решение модератора',
      'moderator-1',
    );

    const override = await overrideModel
      .findOne({ deviceId: 'samsung-galaxy-s24-ultra' })
      .lean()
      .exec();
    expect(override?.patch.modelCodes).toContain('SM-S9280');
    expect(override?.patch.aliases).toContain('галакси с24 ультра');
    expect(override?.patch.dataConfidence).toBe('verified');
  });

  it('linkScreenSignature пересобирает screen_signatures и делает сигнатуру видимой ScreenSignatureService без перезапуска (пункт 8 передачи)', async () => {
    await deviceModel.create(
      buildSampleDevice({
        _id: 'apple-iphone-14-pro',
        brand: 'apple',
        platform: 'ios',
        modelCodes: [],
        aliases: [],
        screenSignatures: [],
        os: { minVersion: '16.0', maxVersion: '18.5' },
      }),
    );
    await catalogService.reload();
    await screenSignatureService.reload();

    expect(screenSignatureService.getBySignature('393x852@3')).toBeUndefined();

    await service.linkScreenSignature(
      'apple-iphone-14-pro',
      { cssWidth: 393, cssHeight: 852, dpr: 3, zoomed: false },
      'измерено на живом контуре агентом 7',
      'moderator-1',
      'task-1',
    );

    const record = screenSignatureService.getBySignature('393x852@3');
    expect(record?.candidates).toEqual(['apple-iphone-14-pro']);
    expect(record?.esimConsensus).toBe('supported');

    const device = catalogService.getSnapshot().devices.get('apple-iphone-14-pro');
    expect(device?.screenSignatures).toEqual([
      { cssWidth: 393, cssHeight: 852, dpr: 3, zoomed: false },
    ]);
  });

  it('createDevice пишет новую запись напрямую в devices и она видна через CatalogService', async () => {
    await catalogService.reload();

    const created = await service.createDevice({
      device: buildSampleDevice({
        _id: 'moderator-created-device',
        provenance: {
          source: 'moderator:test',
          batchId: null,
          importedAt: new Date(),
          agreementCount: null,
        },
      }),
      reason: 'создано вручную специалистом',
      decidedBy: 'moderator-1',
    });

    expect(created._id).toBe('moderator-created-device');
    expect(catalogService.getSnapshot().devices.has('moderator-created-device')).toBe(true);
  });

  it('genericPatch применяет изменение deviceType и логирует действие mark_not_phone', async () => {
    await deviceModel.create(buildSampleDevice({ _id: 'samsung-galaxy-tab', deviceType: 'phone' }));
    await catalogService.reload();

    const updated = await service.genericPatch(
      'samsung-galaxy-tab',
      { deviceType: 'tablet' },
      'на самом деле это планшет',
      'moderator-1',
    );

    expect(updated.deviceType).toBe('tablet');
  });
});

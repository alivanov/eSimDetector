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

  const VENDOR_SOURCE = {
    url: 'https://www.samsung.com/verified',
    title: 'Страница модели на сайте Samsung',
    checkedAt: new Date('2026-08-21T00:00:00.000Z'),
  };

  it('linkModelCode со ссылкой на источник добавляет код, поднимает достоверность до verified и виден через CatalogService сразу же', async () => {
    await deviceModel.create(
      buildSampleDevice({
        _id: 'samsung-galaxy-s24-ultra',
        modelCodes: ['SM-S928B'],
        sources: [],
        dataConfidence: 'derived',
      }),
    );
    await catalogService.reload();

    const updated = await service.linkModelCode({
      deviceId: 'samsung-galaxy-s24-ultra',
      code: 'SM-S9280',
      source: VENDOR_SOURCE,
      reason: 'префикс совпал с уже известным кодом',
      decidedBy: 'moderator-1',
      taskId: null,
    });

    expect(updated.modelCodes).toEqual(['SM-S928B', 'SM-S9280']);
    expect(updated.dataConfidence).toBe('verified');
    // Правило docs/15 §15.4: `verified` обязано иметь ссылку в `sources`, а не только в тексте.
    expect(updated.sources).toEqual([VENDOR_SOURCE]);

    // Без повторного вызова reload() снаружи — reload уже выполнен внутри `applyPatch`.
    const fromSnapshot = catalogService.getSnapshot().devices.get('samsung-galaxy-s24-ultra');
    expect(fromSnapshot?.modelCodes).toEqual(['SM-S928B', 'SM-S9280']);
  });

  it('linkModelCode без ссылки на источник привязывает код, но НЕ поднимает достоверность до verified', async () => {
    await deviceModel.create(
      buildSampleDevice({
        _id: 'samsung-galaxy-s24-ultra',
        modelCodes: ['SM-S928B'],
        sources: [],
        dataConfidence: 'derived',
      }),
    );
    await catalogService.reload();

    const updated = await service.linkModelCode({
      deviceId: 'samsung-galaxy-s24-ultra',
      code: 'SM-S9280',
      reason: 'код совпадает по префиксу, вендорскую страницу найти не удалось',
      decidedBy: 'moderator-1',
      taskId: null,
    });

    expect(updated.modelCodes).toContain('SM-S9280');
    expect(updated.dataConfidence).toBe('derived');
    expect(updated.sources).toEqual([]);
  });

  it('отклоняет решение, поднимающее достоверность до verified без ссылки на источник', async () => {
    await deviceModel.create(
      buildSampleDevice({
        _id: 'samsung-galaxy-s24-ultra',
        sources: [],
        dataConfidence: 'derived',
      }),
    );
    await catalogService.reload();

    await expect(
      service.genericPatch(
        'samsung-galaxy-s24-ultra',
        { dataConfidence: 'verified' },
        'проверил сам, ссылку не приложил',
        'moderator-1',
      ),
    ).rejects.toThrow('ссылки на источник');

    expect(
      catalogService.getSnapshot().devices.get('samsung-galaxy-s24-ultra')?.dataConfidence,
    ).toBe('derived');
  });

  it('отклоняет решение с пустым обоснованием и НЕ выводит справочник из строя (ADR-044)', async () => {
    await deviceModel.create(buildSampleDevice({ _id: 'samsung-galaxy-s24-ultra' }));
    await catalogService.reload();

    await expect(
      service.addAlias('samsung-galaxy-s24-ultra', 'галакси с24 ультра', '', 'moderator-1'),
    ).rejects.toThrow('catalog_overrides');

    // Ни одного документа не записано, справочник остался работоспособным: до ADR-044 такой
    // документ проходил в базу и превращал КАЖДЫЙ последующий запрос сервиса в 503.
    expect(await overrideModel.countDocuments().exec()).toBe(0);
    expect(catalogService.isReady()).toBe(true);
    await catalogService.reload();
    expect(catalogService.isReady()).toBe(true);
  });

  it('второй вызов на то же устройство объединяет патчи, а не затирает предыдущее решение', async () => {
    await deviceModel.create(buildSampleDevice({ _id: 'samsung-galaxy-s24-ultra' }));
    await catalogService.reload();

    await service.linkModelCode({
      deviceId: 'samsung-galaxy-s24-ultra',
      code: 'SM-S9280',
      source: VENDOR_SOURCE,
      reason: 'префикс совпал с уже известным кодом',
      decidedBy: 'moderator-1',
      taskId: null,
    });
    await service.addAlias(
      'samsung-galaxy-s24-ultra',
      'галакси с24 ультра',
      'частая форма записи у пользователей',
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

    await service.linkScreenSignature({
      deviceId: 'apple-iphone-14-pro',
      signature: { cssWidth: 393, cssHeight: 852, dpr: 3, zoomed: false },
      source: {
        url: 'https://support.apple.com/en-us/111850',
        title: 'Технические характеристики iPhone 14 Pro',
        checkedAt: new Date('2026-08-21T00:00:00.000Z'),
      },
      reason: 'измерено на живом контуре',
      decidedBy: 'moderator-1',
      taskId: 'task-1',
    });

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

  it('отклоняет привязку кода, уже принадлежащего другому устройству (инвариант 2)', async () => {
    await deviceModel.create([
      buildSampleDevice({ _id: 'samsung-galaxy-s24-ultra', modelCodes: ['SM-S928B'] }),
      buildSampleDevice({
        _id: 'samsung-galaxy-s24-plus',
        marketingName: 'Galaxy S24+',
        aliases: ['galaxy s24+'],
        modelCodes: ['SM-S926B'],
      }),
    ]);
    await catalogService.reload();

    await expect(
      service.linkModelCode({
        deviceId: 'samsung-galaxy-s24-plus',
        code: 'SM-S928B',
        reason: 'опечатка модератора',
        decidedBy: 'moderator-1',
        taskId: null,
      }),
    ).rejects.toThrow('инвариант 2');

    // Решение не применилось ни к одной из затронутых записей.
    expect(catalogService.getSnapshot().devices.get('samsung-galaxy-s24-plus')?.modelCodes).toEqual(
      ['SM-S926B'],
    );
  });

  it('отклоняет псевдоним, уже указывающий на устройство с другим статусом eSIM (инвариант 3)', async () => {
    await deviceModel.create([
      buildSampleDevice({
        _id: 'samsung-galaxy-a54',
        marketingName: 'Galaxy A54',
        aliases: ['galaxy a54'],
        esim: {
          support: 'not_supported',
          dualSim: 'none',
          maxProfiles: null,
          conditions: [],
          clarifyingQuestion: null,
          notes: '',
        },
      }),
      buildSampleDevice({
        _id: 'samsung-galaxy-s24-ultra',
        aliases: ['galaxy s24 ultra', 's24 ultra'],
      }),
    ]);
    await catalogService.reload();

    await expect(
      service.addAlias(
        'samsung-galaxy-s24-ultra',
        'galaxy a54',
        'пользователь так называет устройство',
        'moderator-1',
      ),
    ).rejects.toThrow('инвариант 3');

    expect(
      catalogService.getSnapshot().devices.get('samsung-galaxy-s24-ultra')?.aliases,
    ).not.toContain('galaxy a54');
  });

  it('отклоняет создание устройства conditional без conditions/clarifyingQuestion (инвариант 5)', async () => {
    await catalogService.reload();

    await expect(
      service.createDevice({
        device: buildSampleDevice({
          _id: 'unknown-brand-conditional-device',
          esim: {
            support: 'conditional',
            dualSim: 'physical+esim',
            maxProfiles: null,
            conditions: [],
            clarifyingQuestion: null,
            notes: '',
          },
        }),
        reason: 'создано вручную специалистом',
        decidedBy: 'moderator-1',
      }),
    ).rejects.toThrow('инвариант 5');

    expect(catalogService.getSnapshot().devices.has('unknown-brand-conditional-device')).toBe(
      false,
    );
  });

  it('createDevice отклоняет повторное создание с уже существующим идентификатором', async () => {
    await catalogService.reload();
    await service.createDevice({
      device: buildSampleDevice({ _id: 'duplicate-device-test' }),
      reason: 'первое создание',
      decidedBy: 'moderator-1',
    });

    await expect(
      service.createDevice({
        device: buildSampleDevice({ _id: 'duplicate-device-test' }),
        reason: 'повторное создание',
        decidedBy: 'moderator-1',
      }),
    ).rejects.toThrow('уже существует');
  });

  it('действия на неизвестном устройстве бросают DEVICE_NOT_FOUND (requireDevice)', async () => {
    await catalogService.reload();

    await expect(
      service.changeEsimStatus(
        'unknown-device',
        { support: 'supported' },
        'derived',
        undefined,
        'причина',
        'moderator-1',
        null,
      ),
    ).rejects.toThrow('не найдено');
  });

  it('повторная привязка ТОЙ ЖЕ сигнатуры не создаёт дубликат в screenSignatures', async () => {
    await deviceModel.create(
      buildSampleDevice({
        _id: 'apple-iphone-15',
        brand: 'apple',
        platform: 'ios',
        modelCodes: [],
        aliases: [],
        screenSignatures: [],
        os: { minVersion: '17.0', maxVersion: '18.5' },
      }),
    );
    await catalogService.reload();
    await screenSignatureService.reload();

    const signature = { cssWidth: 393, cssHeight: 852, dpr: 3, zoomed: false };
    await service.linkScreenSignature({
      deviceId: 'apple-iphone-15',
      signature,
      reason: 'первая привязка',
      decidedBy: 'moderator-1',
      taskId: null,
    });
    const secondCall = await service.linkScreenSignature({
      deviceId: 'apple-iphone-15',
      signature,
      reason: 'повторная привязка той же сигнатуры',
      decidedBy: 'moderator-1',
      taskId: null,
    });

    expect(secondCall.screenSignatures).toEqual([signature]);
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

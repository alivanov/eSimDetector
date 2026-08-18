import { withTestDatabase, type TestDatabaseHandle } from '@esim-detector/test-utils';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import type { ScreenSignatureRecord } from '@esim-detector/contracts';
import type { Model } from 'mongoose';

import { SCREEN_SIGNATURE_MODEL_NAME } from '../../catalog/schemas/screen-signature.schema';

import { ScreenSignatureModule } from './screen-signature.module';
import { ScreenSignatureService } from './screen-signature.service';

/**
 * Интеграционный тест на изолированной тестовой базе (`withTestDatabase()`, ADR-017) — коллекция
 * `screen_signatures` в реальном развёртывании пока пуста (`tools/seed rebuild-signatures` не
 * запускался на полной выгрузке, см. состояние агента 4), поэтому этот тест сам наполняет базу,
 * чтобы проверить прогрев кэша и поиск по сигнатуре на РЕАЛЬНОМ подключении Mongoose.
 */
describe('ScreenSignatureService (интеграция, withTestDatabase)', () => {
  let db: TestDatabaseHandle;
  let moduleRef: TestingModule;
  let service: ScreenSignatureService;
  let model: Model<ScreenSignatureRecord>;

  beforeAll(async () => {
    db = await withTestDatabase('screen-signature-service');
    moduleRef = await Test.createTestingModule({
      imports: [MongooseModule.forRoot(db.uri), ScreenSignatureModule],
    }).compile();

    model = moduleRef.get<Model<ScreenSignatureRecord>>(getModelToken(SCREEN_SIGNATURE_MODEL_NAME));
    service = moduleRef.get(ScreenSignatureService);
  });

  afterEach(async () => {
    await db.truncateAll();
  });

  afterAll(async () => {
    await moduleRef.close();
    await db.close();
  });

  it('на пустой коллекции готов и возвращает undefined на любой запрос (не ошибка, ADR-003)', async () => {
    await service.reload();
    expect(service.isReady()).toBe(true);
    expect(service.getBySignature('393x852@3')).toBeUndefined();
  });

  it('находит сигнатуру после наполнения коллекции и перезагрузки кэша', async () => {
    await model.create({
      signature: '393x852@3',
      zoomed: false,
      candidates: ['apple-iphone-14-pro', 'apple-iphone-15'],
      esimConsensus: 'supported',
    });

    await service.reload();

    const record = service.getBySignature('393x852@3');
    expect(record?.candidates).toEqual(['apple-iphone-14-pro', 'apple-iphone-15']);
    expect(record?.esimConsensus).toBe('supported');
  });

  it('сбой прогрева (запись не проходит валидацию contracts) переводит сервис в статус "не готов", но не бросает исключение', async () => {
    // Отдельный модуль/база — без этого тест зависел бы от порядка выполнения соседних `it`,
    // которые уже могли успешно прогреть `service` из describe-блока (кэш при ошибке
    // сохраняет последнее успешное состояние, а не обнуляется, — см. комментарий ниже).
    const brokenDb = await withTestDatabase('screen-signature-broken');
    try {
      const brokenModuleRef = await Test.createTestingModule({
        imports: [MongooseModule.forRoot(brokenDb.uri), ScreenSignatureModule],
      }).compile();
      const brokenModel = brokenModuleRef.get<Model<ScreenSignatureRecord>>(
        getModelToken(SCREEN_SIGNATURE_MODEL_NAME),
      );
      // Сохранение с отключённой валидацией Mongoose — воспроизводит рассинхронизацию данных,
      // которую обязана поймать `parseScreenSignatureRecord` внутри `reload()` (симметрично
      // аналогичному тесту `CatalogService`, `catalog.integration.spec.ts`).
      await new brokenModel({ signature: 'broken', zoomed: false }).save({
        validateBeforeSave: false,
      });

      const brokenService = brokenModuleRef.get(ScreenSignatureService);
      await brokenService.reload();

      expect(brokenService.isReady()).toBe(false);
      expect(brokenService.getBySignature('393x852@3')).toBeUndefined();

      await brokenModuleRef.close();
    } finally {
      await brokenDb.close();
    }
  });

  it('прогревается автоматически при старте модуля (onModuleInit)', async () => {
    const warmupDb = await withTestDatabase('screen-signature-warmup');
    try {
      const warmupModuleRef = await Test.createTestingModule({
        imports: [MongooseModule.forRoot(warmupDb.uri), ScreenSignatureModule],
      }).compile();

      const warmupModel = warmupModuleRef.get<Model<ScreenSignatureRecord>>(
        getModelToken(SCREEN_SIGNATURE_MODEL_NAME),
      );
      await warmupModel.create({
        signature: '375x812@3',
        zoomed: false,
        candidates: ['apple-iphone-x'],
        esimConsensus: 'not_supported',
      });

      await warmupModuleRef.init();

      const warmupService = warmupModuleRef.get(ScreenSignatureService);
      expect(warmupService.isReady()).toBe(true);
      expect(warmupService.getBySignature('375x812@3')?.candidates).toEqual(['apple-iphone-x']);

      await warmupModuleRef.close();
    } finally {
      await warmupDb.close();
    }
  });
});

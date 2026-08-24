import type { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { withTestDatabase, type TestDatabaseHandle } from '@esim-detector/test-utils';
import {
  buildSampleDevice,
  type Device,
  type ScreenSignatureRecord,
} from '@esim-detector/contracts';
import request from 'supertest';
import type { Model } from 'mongoose';

type SupertestApp = Parameters<typeof request>[0];

/**
 * Сквозные сценарии `POST /api/v1/detect` (docs/08-testing-and-quality.md, §8.3): Android с
 * известным сервисным кодом, iOS через сигнатуру экрана, неопознанное устройство. Изолированная
 * тестовая база (`withTestDatabase()`, ADR-017) наполняется САМИМ тестом — реальный справочник
 * не содержит записей `platform: "ios"` (см. состояние агента 4), поэтому ветка iOS демонстрируется
 * на данных, подготовленных этим e2e-тестом, а не на импортированной выгрузке.
 */
describe('Detect (e2e)', () => {
  let app: INestApplication;
  let db: TestDatabaseHandle;
  let httpServer: SupertestApp;

  beforeAll(async () => {
    db = await withTestDatabase('api-detect-e2e');
    process.env['MONGODB_URI'] = db.uri;

    // Динамический импорт ОБЯЗАТЕЛЕН после установки MONGODB_URI — см. пояснение в
    // health.e2e-spec.ts (docs/08 §8.3: порядок инициализации ConfigModule.forRoot()).
    const { AppModule } = await import('../src/app.module');
    const { configureApp } = await import('../src/configure-app');
    const { DEVICE_MODEL_NAME } = await import('../src/modules/catalog/schemas/device.schema');
    const { SCREEN_SIGNATURE_MODEL_NAME } =
      await import('../src/modules/catalog/schemas/screen-signature.schema');

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    const deviceModel = moduleRef.get<Model<Device>>(getModelToken(DEVICE_MODEL_NAME));
    await deviceModel.create(buildSampleDevice());
    await deviceModel.create(
      buildSampleDevice({
        _id: 'apple-iphone-14-pro',
        brand: 'apple',
        brandTitle: 'Apple',
        marketingName: 'iPhone 14 Pro',
        displayName: 'iPhone 14 Pro',
        family: 'iphone',
        generation: 14,
        modifiers: ['pro'],
        modelCodes: [],
        aliases: [],
        platform: 'ios',
        deviceType: 'phone',
        os: { minVersion: '16.0', maxVersion: '18.6' },
        screenSignatures: [{ cssWidth: 393, cssHeight: 852, dpr: 3, zoomed: false }],
      }),
    );
    await deviceModel.create(
      buildSampleDevice({
        _id: 'apple-iphone-15',
        brand: 'apple',
        brandTitle: 'Apple',
        marketingName: 'iPhone 15',
        displayName: 'iPhone 15',
        family: 'iphone',
        generation: 15,
        modifiers: [],
        modelCodes: [],
        aliases: [],
        platform: 'ios',
        deviceType: 'phone',
        os: { minVersion: '17.0', maxVersion: '18.6' },
        screenSignatures: [{ cssWidth: 393, cssHeight: 852, dpr: 3, zoomed: false }],
      }),
    );

    const REGION_QUESTION = {
      kind: 'region' as const,
      question: 'Лоток для SIM-карты вашего iPhone вмещает одну nano-SIM или две?',
      options: [
        { value: 'CN', label: 'Две nano-SIM (версия для материкового Китая, Гонконга или Макао)' },
        { value: 'OTHER', label: 'Одну nano-SIM (все остальные версии)' },
      ],
    };
    const conditionalEsim = {
      support: 'conditional' as const,
      dualSim: 'physical+esim' as const,
      maxProfiles: 8,
      conditions: [
        { scope: 'region' as const, value: 'CN', support: 'not_supported' as const, note: 'КНР' },
      ],
      clarifyingQuestion: REGION_QUESTION,
      notes: '',
    };
    await deviceModel.create(
      buildSampleDevice({
        _id: 'apple-iphone-16',
        brand: 'apple',
        brandTitle: 'Apple',
        marketingName: 'iPhone 16',
        displayName: 'iPhone 16',
        family: 'iphone',
        generation: 16,
        modifiers: [],
        modelCodes: [],
        aliases: [],
        platform: 'ios',
        deviceType: 'phone',
        os: { minVersion: '18.0', maxVersion: '18.6' },
        screenSignatures: [{ cssWidth: 402, cssHeight: 874, dpr: 3, zoomed: false }],
        esim: conditionalEsim,
      }),
    );
    await deviceModel.create(
      buildSampleDevice({
        _id: 'apple-iphone-16-pro',
        brand: 'apple',
        brandTitle: 'Apple',
        marketingName: 'iPhone 16 Pro',
        displayName: 'iPhone 16 Pro',
        family: 'iphone',
        generation: 16,
        modifiers: ['pro'],
        modelCodes: [],
        aliases: [],
        platform: 'ios',
        deviceType: 'phone',
        os: { minVersion: '18.0', maxVersion: '18.6' },
        screenSignatures: [{ cssWidth: 402, cssHeight: 874, dpr: 3, zoomed: false }],
        esim: conditionalEsim,
      }),
    );

    const screenSignatureModel = moduleRef.get<Model<ScreenSignatureRecord>>(
      getModelToken(SCREEN_SIGNATURE_MODEL_NAME),
    );
    await screenSignatureModel.create({
      signature: '393x852@3',
      zoomed: false,
      candidates: ['apple-iphone-14-pro', 'apple-iphone-15'],
      esimConsensus: 'supported',
    });
    await screenSignatureModel.create({
      signature: '402x874@3',
      zoomed: false,
      candidates: ['apple-iphone-16', 'apple-iphone-16-pro'],
      esimConsensus: 'conditional',
    });

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    httpServer = app.getHttpServer() as SupertestApp;
  });

  afterAll(async () => {
    await app.close();
    await db.close();
  });

  it('два одинаковых POST /api/v1/detect подряд → одинаковые status, device.id, reasons[].code, exactModelKnown (идемпотентность)', async () => {
    const body = { signals: { uaData: { platform: 'Android', model: 'SM-S928B' } } };

    const first = await request(httpServer).post('/api/v1/detect').send(body);
    const second = await request(httpServer).post('/api/v1/detect').send(body);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.status).toBe(first.body.status);
    expect(second.body.device?.id ?? null).toBe(first.body.device?.id ?? null);
    expect(second.body.detection.exactModelKnown).toBe(first.body.detection.exactModelKnown);
    const firstCodes = (first.body.reasons as { code: string }[]).map((reason) => reason.code);
    const secondCodes = (second.body.reasons as { code: string }[]).map((reason) => reason.code);
    expect(secondCodes).toEqual(firstCodes);
  });

  it('Android с известным сервисным кодом → 200, status supported, device известен', async () => {
    const response = await request(httpServer)
      .post('/api/v1/detect')
      .send({ signals: { uaData: { platform: 'Android', model: 'SM-S928B' } } });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('supported');
    expect(response.body.device.id).toBe('samsung-galaxy-s24-ultra');
    expect(response.body.reasons.length).toBeGreaterThan(0);
    expect(response.body.presentation.title).toBe('Ваше устройство поддерживает eSIM');
  });

  it('iOS через версию + сигнатуру экрана → 200, group supported (exactModelKnown=false)', async () => {
    const response = await request(httpServer)
      .post('/api/v1/detect')
      .send({
        signals: {
          userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15',
          screen: { width: 393, height: 852, dpr: 3, orientation: 'portrait-primary' },
        },
      });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('supported');
    expect(response.body.detection).toMatchObject({ platform: 'ios', exactModelKnown: false });
    expect(response.body.device).toBeNull();
  });

  it('неопознанное устройство (неизвестный сервисный код) → 200 clarification_required (ADR-008: не ошибка)', async () => {
    const response = await request(httpServer)
      .post('/api/v1/detect')
      .send({ signals: { uaData: { platform: 'Android', model: 'SM-UNKNOWN99' } } });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('clarification_required');
    expect(response.body.device).toBeNull();
  });

  it('запрос без единого сигнала → 200 clarification_required (все поля signals необязательны)', async () => {
    const response = await request(httpServer).post('/api/v1/detect').send({});

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('clarification_required');
  });

  it('некорректное тело запроса (screen.width — строка) → 400 VALIDATION_ERROR', async () => {
    const response = await request(httpServer)
      .post('/api/v1/detect')
      .send({ signals: { screen: { width: 'not-a-number' } } });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('прокидывает X-Request-Id в ответ /api/v1/detect', async () => {
    const response = await request(httpServer)
      .post('/api/v1/detect')
      .set('X-Request-Id', 'e2e-request-1')
      .send({});

    expect(response.headers['x-request-id']).toBe('e2e-request-1');
    expect(response.body.requestId).toBe('e2e-request-1');
  });

  it('выставляет Accept-CH/Critical-CH (docs/03 §3.2, docs/07 §7.5)', async () => {
    const response = await request(httpServer).post('/api/v1/detect').send({});

    expect(response.headers['accept-ch']).toContain('Sec-CH-UA-Model');
    expect(response.headers['critical-ch']).toBe('Sec-CH-UA-Model');
  });

  it('iOS-группа с общим региональным условием без региона → 200 answer_question, а не список моделей (этап 5.3а)', async () => {
    const response = await request(httpServer)
      .post('/api/v1/detect')
      .send({
        signals: {
          userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15',
          screen: { width: 402, height: 874, dpr: 3, orientation: 'portrait-primary' },
        },
      });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('clarification_required');
    expect(response.body.detection.exactModelKnown).toBe(false);
    expect(response.body.clarification.kind).toBe('answer_question');
    const options = response.body.clarification.options as { id: string }[];
    expect(options.map((o) => o.id).sort()).toEqual(['CN', 'OTHER']);
  });

  it('тот же запрос с context.region="CN" → 200 not_supported, определённо, без уточнения', async () => {
    const response = await request(httpServer)
      .post('/api/v1/detect')
      .send({
        signals: {
          userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15',
          screen: { width: 402, height: 874, dpr: 3, orientation: 'portrait-primary' },
        },
        context: { region: 'CN' },
      });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('not_supported');
    expect(response.body.clarification).toBeUndefined();
    const reasons = response.body.reasons as { code: string }[];
    expect(reasons.some((r) => r.code === 'ESIM_CONDITION_MATCHED_REGION')).toBe(true);
  });

  it('тот же запрос с другим context.region → 200 supported (общий случай conditional)', async () => {
    const response = await request(httpServer)
      .post('/api/v1/detect')
      .send({
        signals: {
          userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15',
          screen: { width: 402, height: 874, dpr: 3, orientation: 'portrait-primary' },
        },
        context: { region: 'RU' },
      });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('supported');
    expect(response.body.clarification).toBeUndefined();
    const reasons = response.body.reasons as { code: string }[];
    expect(reasons.some((r) => r.code === 'ESIM_CONDITION_DEFAULT_SUPPORTED')).toBe(true);
  });
});

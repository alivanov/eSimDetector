import type { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { withTestDatabase, type TestDatabaseHandle } from '@esim-detector/test-utils';
import { buildSampleDevice, type Device } from '@esim-detector/contracts';
import request from 'supertest';
import type { Model } from 'mongoose';

type SupertestApp = Parameters<typeof request>[0];

/**
 * Сквозные сценарии `GET/POST /api/v1/devices/search` (docs/06-api-contract.md, §6.3;
 * docs/08-testing-and-quality.md, §8.3).
 */
describe('Search (e2e)', () => {
  let app: INestApplication;
  let db: TestDatabaseHandle;
  let httpServer: SupertestApp;

  beforeAll(async () => {
    db = await withTestDatabase('api-search-e2e');
    process.env['MONGODB_URI'] = db.uri;

    const { AppModule } = await import('../src/app.module');
    const { configureApp } = await import('../src/configure-app');
    const { DEVICE_MODEL_NAME } = await import('../src/modules/catalog/schemas/device.schema');

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    const deviceModel = moduleRef.get<Model<Device>>(getModelToken(DEVICE_MODEL_NAME));
    await deviceModel.create(buildSampleDevice());

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    httpServer = app.getHttpServer() as SupertestApp;
  });

  afterAll(async () => {
    await app.close();
    await db.close();
  });

  it('GET /api/v1/devices/search?q=... находит устройство по кириллическому запросу', async () => {
    const response = await request(httpServer)
      .get('/api/v1/devices/search')
      .query({ q: 'самсунг галакси с24 ультра' });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('supported');
    expect(response.body.device.id).toBe('samsung-galaxy-s24-ultra');
    expect(response.body.query.normalized).toBeDefined();
  });

  it('POST /api/v1/devices/search с тем же q в теле даёт тот же результат', async () => {
    const response = await request(httpServer)
      .post('/api/v1/devices/search')
      .send({ q: 'galaxy s24 ultra' });

    expect(response.status).toBe(200);
    expect(response.body.device.id).toBe('samsung-galaxy-s24-ultra');
  });

  it('посторонний ввод → 200 clarification_required, а не ошибка', async () => {
    const response = await request(httpServer)
      .get('/api/v1/devices/search')
      .query({ q: 'zzqxqzнеизвестныйввод999' });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('clarification_required');
    expect(response.body.device).toBeNull();
  });

  it('пустой q → 400 VALIDATION_ERROR', async () => {
    const response = await request(httpServer).get('/api/v1/devices/search').query({ q: '' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('GET /api/v1/devices/suggest возвращает подсказки', async () => {
    const response = await request(httpServer)
      .get('/api/v1/devices/suggest')
      .query({ q: 'galaxy s24' });

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.suggestions)).toBe(true);
  });
});

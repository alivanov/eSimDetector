import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { withTestDatabase, type TestDatabaseHandle } from '@esim-detector/test-utils';
import request from 'supertest';

type SupertestApp = Parameters<typeof request>[0];

/**
 * Ограничение частоты (docs/06-api-contract.md §6.1, docs/07-integration.md §7.8:
 * `RATE_LIMIT_RPM`) — сквозная проверка через реальный HTTP-конвейер, а не только модульный тест
 * гварда (`common/guards/rate-limit.guard.spec.ts`). `RATE_LIMIT_RPM` выставлен в переменную
 * окружения ДО динамического импорта `AppModule` — тот же порядок, что и у `MONGODB_URI`
 * (docs/08-testing-and-quality.md §8.3): `ConfigModule.forRoot()` читает `process.env` синхронно
 * в момент первой загрузки модуля.
 */
describe('Rate limit (e2e)', () => {
  let app: INestApplication;
  let db: TestDatabaseHandle;
  let httpServer: SupertestApp;

  beforeAll(async () => {
    db = await withTestDatabase('api-rate-limit-e2e');
    process.env['MONGODB_URI'] = db.uri;
    process.env['RATE_LIMIT_RPM'] = '3';

    const { AppModule } = await import('../src/app.module');
    const { configureApp } = await import('../src/configure-app');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    httpServer = app.getHttpServer() as SupertestApp;
  });

  afterAll(async () => {
    await app.close();
    await db.close();
    delete process.env['RATE_LIMIT_RPM'];
  });

  it('первые RATE_LIMIT_RPM запросов проходят, следующий отвечает 429 RATE_LIMITED с Retry-After', async () => {
    for (let i = 0; i < 3; i += 1) {
      const ok = await request(httpServer).post('/api/v1/detect').send({});
      expect(ok.status).toBe(200);
    }

    const limited = await request(httpServer).post('/api/v1/detect').send({});

    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe('RATE_LIMITED');
    expect(limited.headers['retry-after']).toEqual(expect.any(String));
  });

  it('не ограничивает частоту /health/ready независимо от того, сколько запросов /detect уже исчерпало квоту', async () => {
    const response = await request(httpServer).get('/health/ready');

    expect(response.status).toBe(200);
  });
});

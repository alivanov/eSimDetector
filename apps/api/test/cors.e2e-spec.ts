import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { withTestDatabase, type TestDatabaseHandle } from '@esim-detector/test-utils';
import request from 'supertest';

type SupertestApp = Parameters<typeof request>[0];

const ALLOWED_ORIGIN = 'https://widget-host.example.ru';
const OTHER_ALLOWED_ORIGIN = 'https://another-host.example.ru';
const DISALLOWED_ORIGIN = 'https://evil.example.ru';

describe('CORS (e2e)', () => {
  let app: INestApplication;
  let db: TestDatabaseHandle;
  let httpServer: SupertestApp;

  beforeAll(async () => {
    db = await withTestDatabase('api-cors-e2e');
    process.env['MONGODB_URI'] = db.uri;
    // Список, а не `*` — проверяет содержательный сценарий промышленного режима (docs/07 §7.8,
    // ADR-025 п.5), а не только режим по умолчанию демонстрационного контура.
    process.env['CORS_ORIGINS'] = `${ALLOWED_ORIGIN},${OTHER_ALLOWED_ORIGIN}`;

    // См. комментарий в health.e2e-spec.ts: динамический импорт после установки переменных
    // окружения — `ConfigModule.forRoot()` читает `process.env` синхронно при первой загрузке.
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
    delete process.env['CORS_ORIGINS'];
  });

  it('отражает разрешённый источник в Access-Control-Allow-Origin', async () => {
    const response = await request(httpServer).get('/health/live').set('Origin', ALLOWED_ORIGIN);

    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
  });

  it('отражает второй разрешённый источник из списка', async () => {
    const response = await request(httpServer)
      .get('/health/live')
      .set('Origin', OTHER_ALLOWED_ORIGIN);

    expect(response.headers['access-control-allow-origin']).toBe(OTHER_ALLOWED_ORIGIN);
  });

  it('не отражает источник, не входящий в список разрешённых', async () => {
    const response = await request(httpServer).get('/health/live').set('Origin', DISALLOWED_ORIGIN);

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('открывает X-Request-Id для чтения кросс-доменным кодом (Access-Control-Expose-Headers)', async () => {
    const response = await request(httpServer).get('/health/live').set('Origin', ALLOWED_ORIGIN);

    expect(response.headers['access-control-expose-headers']).toContain('X-Request-Id');
  });

  it('отвечает на предполётный OPTIONS-запрос разрешённого источника', async () => {
    const response = await request(httpServer)
      .options('/api/v1/detect')
      .set('Origin', ALLOWED_ORIGIN)
      .set('Access-Control-Request-Method', 'POST');

    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
  });
});

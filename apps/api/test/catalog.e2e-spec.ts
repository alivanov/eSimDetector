import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { withTestDatabase, type TestDatabaseHandle } from '@esim-detector/test-utils';
import request from 'supertest';

type SupertestApp = Parameters<typeof request>[0];

describe('Catalog (e2e)', () => {
  let app: INestApplication;
  let db: TestDatabaseHandle;
  let httpServer: SupertestApp;

  beforeAll(async () => {
    db = await withTestDatabase('api-catalog-e2e');
    process.env['MONGODB_URI'] = db.uri;

    // См. пояснение в health.e2e-spec.ts: динамический импорт ОБЯЗАТЕЛЕН после установки
    // MONGODB_URI, поскольку ConfigModule.forRoot() читает process.env синхронно при первой
    // загрузке модуля (docs/08-testing-and-quality.md, §8.3).
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
  });

  it('GET /api/v1/catalog/meta отвечает 200 на пустом справочнике (критерий готовности агента 3)', async () => {
    const response = await request(httpServer).get('/api/v1/catalog/meta');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ deviceCount: 0, updatedAt: null });
    expect(typeof response.body.version).toBe('string');
    expect(response.body.version.length).toBeGreaterThan(0);
  });

  it('прокидывает X-Request-Id в ответе /api/v1/catalog/meta', async () => {
    const response = await request(httpServer).get('/api/v1/catalog/meta');

    expect(response.headers['x-request-id']).toEqual(expect.any(String));
  });
});

describe('Health + Catalog readiness (e2e)', () => {
  let app: INestApplication;
  let db: TestDatabaseHandle;
  let httpServer: SupertestApp;

  beforeAll(async () => {
    db = await withTestDatabase('api-health-catalog-degraded-e2e');
    process.env['MONGODB_URI'] = db.uri;

    const { AppModule } = await import('../src/app.module');
    const { configureApp } = await import('../src/configure-app');
    const { CatalogService } = await import('../src/modules/catalog/catalog.service');
    const { ApiError } = await import('../src/common/errors/api-error');
    const { HttpStatus } = await import('@nestjs/common');

    function throwCatalogUnavailable(): never {
      throw new ApiError(
        'CATALOG_UNAVAILABLE',
        'Справочник не загружен (сервис ещё не готов)',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const notReadyCatalogService = {
      isReady: () => false,
      getStatus: () => 'loading' as const,
      getMeta: throwCatalogUnavailable,
      getSnapshot: throwCatalogUnavailable,
      reload: () => Promise.resolve(undefined),
      onModuleInit: () => Promise.resolve(undefined),
    };

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CatalogService)
      .useValue(notReadyCatalogService)
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    httpServer = app.getHttpServer() as SupertestApp;
  });

  afterAll(async () => {
    await app.close();
    await db.close();
  });

  it('GET /health/ready отдаёт degraded и 503, когда справочник не загружен', async () => {
    const response = await request(httpServer).get('/health/ready');

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({
      status: 'degraded',
      dependencies: { mongodb: 'connected', catalog: 'loading' },
    });
  });

  it('GET /api/v1/catalog/meta отдаёт CATALOG_UNAVAILABLE с кодом 503, когда справочник не загружен', async () => {
    const response = await request(httpServer).get('/api/v1/catalog/meta');

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({ error: { code: 'CATALOG_UNAVAILABLE' } });
  });
});

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { withTestDatabase, type TestDatabaseHandle } from '@esim-detector/test-utils';
import request from 'supertest';

// NestJS типизирует `getHttpServer()` как `any` (внутренняя деталь адаптера
// платформы), поэтому здесь нужен явный тип аргумента для supertest —
// `App` не экспортируется пакетом напрямую, только выводится из сигнатуры `request`.
type SupertestApp = Parameters<typeof request>[0];

describe('Health (e2e)', () => {
  let app: INestApplication;
  let db: TestDatabaseHandle;
  let httpServer: SupertestApp;

  beforeAll(async () => {
    db = await withTestDatabase('api-health-e2e');
    process.env['MONGODB_URI'] = db.uri;

    // `AppModule` подключается динамически, а не статическим `import` в начале файла:
    // `ConfigModule.forRoot()` читает `process.env` синхронно в момент вычисления
    // декоратора `@Module`, то есть в момент первой загрузки модуля. Статический
    // импорт выполнился бы до строки выше, и сервис получил бы значение
    // `MONGODB_URI` по умолчанию вместо адреса тестовой базы.
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

  it('GET /health/live всегда отвечает 200 без обращения к базе данных', async () => {
    const response = await request(httpServer).get('/health/live');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('GET /health/ready отвечает 200, когда подключение к MongoDB установлено', async () => {
    const response = await request(httpServer).get('/health/ready');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: 'ok',
      dependencies: { mongodb: 'connected' },
    });
  });

  it('прокидывает X-Request-Id в ответе, генерируя новый при отсутствии', async () => {
    const response = await request(httpServer).get('/health/live');

    expect(response.headers['x-request-id']).toEqual(expect.any(String));
  });

  it('сохраняет присланный X-Request-Id без изменений', async () => {
    const response = await request(httpServer)
      .get('/health/live')
      .set('X-Request-Id', 'fixed-request-id');

    expect(response.headers['x-request-id']).toBe('fixed-request-id');
  });
});

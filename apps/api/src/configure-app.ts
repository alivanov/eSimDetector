import type { INestApplication } from '@nestjs/common';
import { HttpStatus, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { parseCorsOrigins } from './common/cors-origins';
import { ApiError } from './common/errors/api-error';
import { ApiExceptionFilter } from './common/filters/api-exception.filter';
import { ClientHintsInterceptor } from './common/interceptors/client-hints.interceptor';
import { REQUEST_ID_HEADER, requestIdMiddleware } from './common/middleware/request-id.middleware';
import type { EnvConfig } from './config/env.schema';
import { setupSwagger } from './swagger.config';

/**
 * Общая настройка приложения (middleware, фильтры, префикс маршрутов),
 * вынесенная из `main.ts`, чтобы e2e-тесты поднимали приложение в том же
 * виде, в каком оно работает в проде — без риска забыть применить один
 * из шагов в тестах и получить ложно проходящий или ложно падающий тест.
 *
 * `ValidationPipe` — граница валидации DTO (`class-validator`, ADR-016): недоверенные внешние
 * данные (тело `POST /detect`, параметры `GET /devices/search`) проверяются здесь один раз,
 * до попадания в контроллеры. `transform: true` конструирует экземпляр класса DTO (нужно для
 * `@Type()`/вложенных объектов и для приведения query-параметров вроде `limit` к числу);
 * `whitelist: true` отбрасывает поля, не описанные в DTO, — сигналы браузера могут прислать
 * лишнее в будущих версиях клиента, и это не должно приводить к ошибке валидации.
 */
export function configureApp(app: INestApplication): void {
  // CORS — единственное разрешённое вторжение этого этапа в `apps/api` (docs/09-decisions.md
  // ADR-040, найденный дефект закрытого этапа: `CORS_ORIGINS` был объявлен в конфигурации
  // (docs/07 §7.8, `.env.example`) с этапа 5, но `app.enableCors` не вызывался — виджет на чужом
  // домене не мог обратиться к API вовсе, браузер отклонял ответ до попадания в код виджета.
  // `exposedHeaders` обязателен ОТДЕЛЬНО от разрешения источника: без него заказчик не прочитает
  // сквозной `X-Request-Id` из кросс-доменного ответа, даже когда сам запрос разрешён.
  const configService = app.get<ConfigService<EnvConfig, true>>(ConfigService);
  const corsOrigins = configService.get('CORS_ORIGINS', { infer: true });
  app.enableCors({
    origin: parseCorsOrigins(corsOrigins),
    exposedHeaders: [REQUEST_ID_HEADER],
  });

  app.use(requestIdMiddleware);
  app.useGlobalFilters(new ApiExceptionFilter());
  app.useGlobalInterceptors(new ClientHintsInterceptor());
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      exceptionFactory: (errors) =>
        new ApiError(
          'VALIDATION_ERROR',
          'Запрос не соответствует схеме',
          HttpStatus.BAD_REQUEST,
          errors.flatMap((error) =>
            Object.values(error.constraints ?? {}).map((issue) => ({
              field: error.property,
              issue,
            })),
          ),
        ),
    }),
  );
  app.setGlobalPrefix('api/v1', { exclude: ['health/live', 'health/ready'] });

  // `SwaggerModule.setup` регистрирует маршруты напрямую на HTTP-адаптере и не затрагивается
  // `setGlobalPrefix` выше — поэтому пути документации остаются `/api/docs`/`/api/docs-json`,
  // а не `/api/v1/api/docs` (docs/06-api-contract.md §6.4).
  setupSwagger(app);
}

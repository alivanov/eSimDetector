import type { INestApplication } from '@nestjs/common';
import { HttpStatus, ValidationPipe } from '@nestjs/common';

import { ApiError } from './common/errors/api-error';
import { ApiExceptionFilter } from './common/filters/api-exception.filter';
import { ClientHintsInterceptor } from './common/interceptors/client-hints.interceptor';
import { requestIdMiddleware } from './common/middleware/request-id.middleware';

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
}

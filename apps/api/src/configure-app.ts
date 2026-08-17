import type { INestApplication } from '@nestjs/common';

import { ApiExceptionFilter } from './common/filters/api-exception.filter';
import { requestIdMiddleware } from './common/middleware/request-id.middleware';

/**
 * Общая настройка приложения (middleware, фильтры, префикс маршрутов),
 * вынесенная из `main.ts`, чтобы e2e-тесты поднимали приложение в том же
 * виде, в каком оно работает в проде — без риска забыть применить один
 * из шагов в тестах и получить ложно проходящий или ложно падающий тест.
 */
export function configureApp(app: INestApplication): void {
  app.use(requestIdMiddleware);
  app.useGlobalFilters(new ApiExceptionFilter());
  app.setGlobalPrefix('api/v1', { exclude: ['health/live', 'health/ready'] });
}

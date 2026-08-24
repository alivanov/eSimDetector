import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

/**
 * `GET /api/docs` (Swagger UI) и `GET /api/docs-json` (спецификация OpenAPI 3.0.0) —
 * docs/06-api-contract.md, преамбула. `@nestjs/swagger` без `.setOpenAPIVersion()` печатает
 * 3.0.0 — документ приведён к факту. Спецификация строится из декораторов контроллеров
 * (`@ApiOperation`/`@ApiResponse`/`@ApiQuery`/`@ApiSecurity`/DTO) — без ручного дублирования
 * путей здесь.
 *
 * Группа `/api/v1/admin/*` выделена отдельным тегом `admin` (docs/15-moderation.md §15.8:
 * «в спецификации OpenAPI выделена в отдельный тег») — оба контроллера этой группы
 * (`AdminCatalogController`, `ModerationTasksController`) помечены `@ApiTags('admin')`.
 *
 * Не документирует результат определения (`clarification_required` и т. п.) как ошибку HTTP —
 * это код 200 (ADR-008); теги и описания ниже отражают только транспортный уровень.
 */
export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('eSIM Detector API')
    .setDescription(
      'Сервис определения устройства пользователя и статуса поддержки eSIM. ' +
        'Базовый путь — /api/v1 (docs/06-api-contract.md §6.1). Раздел `admin` — ' +
        'группа /api/v1/admin/* за токеном ADMIN_TOKEN (docs/15-moderation.md §15.7—§15.8).',
    )
    .setVersion('1')
    .addTag('detect', 'Автоматическое определение устройства по сигналам браузера (§6.2)')
    .addTag('devices', 'Определение по названию, подсказки, карточка устройства (§6.3—§6.4)')
    .addTag('catalog', 'Метаданные справочника (§6.4)')
    .addTag('feedback', 'Обращения пользователей о неверном результате (§6.4)')
    .addTag('health', 'Проверки состояния для оркестратора')
    .addTag('admin', 'Модерация справочника — за ADMIN_TOKEN, без исключений (docs/15 §15.8)')
    .addApiKey({ type: 'apiKey', name: 'X-Api-Key', in: 'header' }, 'X-Api-Key')
    .addApiKey({ type: 'apiKey', name: 'X-Admin-Token', in: 'header' }, 'ADMIN_TOKEN')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    jsonDocumentUrl: 'api/docs-json',
  });
}

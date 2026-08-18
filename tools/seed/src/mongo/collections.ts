/**
 * Имена коллекций MongoDB (docs/05-data-model.md §5.3, §5.5, §5.6) — те же строки, что в
 * `apps/api/src/modules/catalog/schemas/*.schema.ts` (`DEVICE_COLLECTION_NAME` и т. п.).
 * `tools/seed` не импортирует `apps/api` (инструмент не зависит от приложения) и работает с
 * коллекциями через нативный драйвер MongoDB (`mongoose.Connection.collection(...)`), а не
 * через Mongoose-схемы `apps/api` — валидация документа выполняется ДО записи схемой `zod`
 * (`@esim-detector/contracts`, ADR-016), а не Mongoose-валидатором.
 */
export const DEVICES_COLLECTION = 'devices';
export const CATALOG_OVERRIDES_COLLECTION = 'catalog_overrides';
export const SCREEN_SIGNATURES_COLLECTION = 'screen_signatures';

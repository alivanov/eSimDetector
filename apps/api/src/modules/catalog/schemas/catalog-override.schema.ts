import type { CatalogOverride } from '@esim-detector/contracts';
import { Schema, type HydratedDocument, type Model, type SchemaDefinition } from 'mongoose';

/**
 * Mongoose-схема коллекции `catalog_overrides` (docs/05-data-model.md, §5.6, §5.7) — слой
 * решений модератора, применяемый поверх всех прочих источников последним и переживающий
 * повторные импорты (ADR-014). Тип `CatalogOverride` — единственное объявление в
 * `@esim-detector/contracts` (`catalog-override.schema.ts`), см. пояснение о пределах проверки
 * компилятором в `device.schema.ts`.
 */
export const CATALOG_OVERRIDE_MODEL_NAME = 'CatalogOverride';
export const CATALOG_OVERRIDE_COLLECTION_NAME = 'catalog_overrides';

/**
 * `patch` описывает поля через `Schema.Types.Mixed`, а не отдельными путями — намеренно. Форма
 * `patch` ПОЛНОСТЬЮ произвольна по составу (любое подмножество полей `EsimInfo`, ADR-011/docs/14
 * §14.4 шаг 6): реальным источником истины для её корректности является `catalogOverrideSchema.parse`
 * в `@esim-detector/contracts` — КАЖДАЯ запись проходит эту валидацию до сохранения (`CatalogModule`,
 * будущий модуль модерации, агент 7), а Mongoose здесь используется как типизированное хранилище
 * произвольного JSON, а не как источник структурной валидации патча (ADR-011: «документная модель
 * удобнее строгой схемы» для структур переменного состава).
 *
 * `createdAt`/`updatedAt` НЕ помечены `required: true`, хотя тип `CatalogOverride` требует их
 * всегда: опция схемы `timestamps: true` ниже сама заполняет оба поля при первом сохранении и
 * при каждом обновлении, а `required` конфликтует с порядком применения этого плагина —
 * документ без явно переданных значений ошибочно отклонялся бы валидацией до того, как плагин
 * успевал их проставить (проверено этим агентом эмпирически, `catalog.integration.spec.ts`).
 */
const catalogOverrideDefinition: SchemaDefinition<CatalogOverride> = {
  deviceId: { type: String, required: true },
  patch: { type: Schema.Types.Mixed, required: true },
  reason: { type: String, required: true },
  decidedBy: { type: String, required: true },
  decidedAt: { type: Date, required: true },
  createdAt: { type: Date },
  updatedAt: { type: Date },
};

export const catalogOverrideMongooseSchema = new Schema<CatalogOverride>(
  catalogOverrideDefinition,
  {
    collection: CATALOG_OVERRIDE_COLLECTION_NAME,
    timestamps: true,
  },
);

/** Уникальный индекс — применение слоя решений модератора по идентификатору устройства (docs/05 §5.7). */
catalogOverrideMongooseSchema.index({ deviceId: 1 }, { unique: true });

export type CatalogOverrideDocument = HydratedDocument<CatalogOverride>;
export type CatalogOverrideModel = Model<CatalogOverride>;

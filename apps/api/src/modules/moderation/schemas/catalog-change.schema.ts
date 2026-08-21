import type { CatalogChangeEntry } from '@esim-detector/contracts';
import { catalogChangeActionSchema } from '@esim-detector/contracts';
import { Schema, type HydratedDocument, type Model } from 'mongoose';

/**
 * Mongoose-схема коллекции `catalog_changes` (docs/05-data-model.md §5.6; docs/15-moderation.md
 * §15.6) — журнал только для чтения. `previousValue`/`newValue` — `Mixed`: их форма зависит от
 * поля (`esim`, `modelCodes`, `aliases`, ...), а не от единого union (симметрично `payload` у
 * `moderation_tasks`).
 */
export const CATALOG_CHANGE_MODEL_NAME = 'CatalogChange';
export const CATALOG_CHANGE_COLLECTION_NAME = 'catalog_changes';

const catalogChangeDefinition = {
  deviceId: { type: String, default: null },
  taskId: { type: String, default: null },
  action: { type: String, enum: catalogChangeActionSchema.options, required: true },
  field: { type: String, default: null },
  previousValue: { type: Schema.Types.Mixed, default: null },
  newValue: { type: Schema.Types.Mixed, default: null },
  reason: { type: String, required: true },
  decidedBy: { type: String, required: true },
  createdAt: { type: Date, required: true },
};

export const catalogChangeMongooseSchema = new Schema(catalogChangeDefinition, {
  collection: CATALOG_CHANGE_COLLECTION_NAME,
});

catalogChangeMongooseSchema.index({ deviceId: 1, createdAt: -1 });
catalogChangeMongooseSchema.index({ createdAt: -1 });

export type CatalogChangeDocument = HydratedDocument<CatalogChangeEntry>;
export type CatalogChangeModel = Model<CatalogChangeEntry>;

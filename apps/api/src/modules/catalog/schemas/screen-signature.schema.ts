import type { ScreenSignatureRecord } from '@esim-detector/contracts';
import { esimConsensusSchema } from '@esim-detector/contracts';
import { Schema, type HydratedDocument, type Model, type SchemaDefinition } from 'mongoose';

/**
 * Mongoose-схема производной коллекции `screen_signatures` (docs/05-data-model.md, §5.5, §5.7).
 * Тип `ScreenSignatureRecord` — единственное объявление в `@esim-detector/contracts`, см.
 * пояснение о пределах проверки компилятором в `device.schema.ts`.
 */
export const SCREEN_SIGNATURE_MODEL_NAME = 'ScreenSignature';
export const SCREEN_SIGNATURE_COLLECTION_NAME = 'screen_signatures';

const screenSignatureRecordDefinition: SchemaDefinition<ScreenSignatureRecord> = {
  signature: { type: String, required: true },
  zoomed: { type: Boolean, required: true },
  candidates: { type: [String], default: [] },
  esimConsensus: { type: String, enum: esimConsensusSchema.options, required: true },
  // НЕ помечены `required: true` — см. пояснение в device.schema.ts / catalog-override.schema.ts:
  // `timestamps: true` сам заполняет оба поля, `required` конфликтует с порядком плагина.
  createdAt: { type: Date },
  updatedAt: { type: Date },
};

export const screenSignatureMongooseSchema = new Schema<ScreenSignatureRecord>(
  screenSignatureRecordDefinition,
  { collection: SCREEN_SIGNATURE_COLLECTION_NAME, timestamps: true },
);

/** Уникальный индекс — резолюция ветки iOS за один поиск (docs/05 §5.7). */
screenSignatureMongooseSchema.index({ signature: 1 }, { unique: true });

export type ScreenSignatureDocument = HydratedDocument<ScreenSignatureRecord>;
export type ScreenSignatureModel = Model<ScreenSignatureRecord>;

import type { Device } from '@esim-detector/contracts';
import {
  dataConfidenceSchema,
  deviceStatusSchema,
  deviceTypeSchema,
  dualSimModeSchema,
  esimConditionScopeSchema,
  esimConditionSupportSchema,
  esimSupportSchema,
  marketPresenceRuSchema,
  platformSchema,
} from '@esim-detector/contracts';
import { Schema, type HydratedDocument, type Model, type SchemaDefinition } from 'mongoose';

/**
 * Mongoose-схема коллекции `devices` (docs/05-data-model.md, §5.3, §5.7). Тип `Device` из
 * `@esim-detector/contracts` (ADR-011: «единственное объявление, из которого выводятся... схема
 * Mongoose») объявлен ЕДИНСТВЕННЫЙ РАЗ как zod-схема, а здесь только описывается его хранение.
 *
 * Типизация `SchemaDefinition<Device>` ловит на этапе `tsc` два вида расхождений: лишнее поле,
 * которого нет в `Device`, и неверный ТИП уже объявленного поля. Она НЕ ловит третий вид —
 * пропущенное поле: `mongoose.SchemaDefinition<T>` определён как `{ [K in keyof T]?: ... }`
 * (каждый путь необязателен), поэтому забытое поле `Device` компилятор не поймает. Это
 * дополнительно проверяется модульным тестом на реальном документе (`device.schema.spec.ts`):
 * `deviceSchema.parse(model.toObject())` после `new Model(sampleDevice).validateSync()` —
 * несовпадение набора путей проявляется как ошибка валидации zod либо Mongoose.
 */
export const DEVICE_MODEL_NAME = 'Device';
export const DEVICE_COLLECTION_NAME = 'devices';

const screenSignatureSubSchema = new Schema(
  {
    cssWidth: { type: Number, required: true },
    cssHeight: { type: Number, required: true },
    dpr: { type: Number, required: true },
    zoomed: { type: Boolean, required: true },
  },
  { _id: false },
);

const esimConditionSubSchema = new Schema(
  {
    scope: { type: String, enum: esimConditionScopeSchema.options, required: true },
    value: { type: String, required: true },
    support: { type: String, enum: esimConditionSupportSchema.options, required: true },
    note: { type: String, required: true },
  },
  { _id: false },
);

const esimClarifyingQuestionSubSchema = new Schema(
  {
    kind: { type: String, enum: esimConditionScopeSchema.options, required: true },
    question: { type: String, required: true },
    options: [
      {
        value: { type: String, required: true },
        label: { type: String, required: true },
      },
    ],
  },
  { _id: false },
);

const deviceSourceSubSchema = new Schema(
  {
    url: { type: String, required: true },
    title: { type: String, required: true },
    checkedAt: { type: Date, required: true },
  },
  { _id: false },
);

const deviceSchemaDefinition: SchemaDefinition<Device> = {
  _id: { type: String, required: true },
  brand: { type: String, required: true },
  brandTitle: { type: String, required: true },
  marketingName: { type: String, required: true },
  displayName: { type: String, required: true },
  family: { type: String, required: true },
  generation: { type: Number, default: null },
  modifiers: { type: [String], default: [] },
  modelCodes: { type: [String], default: [] },
  aliases: { type: [String], default: [] },
  platform: { type: String, enum: platformSchema.options, required: true },
  deviceType: { type: String, enum: deviceTypeSchema.options, required: true },
  os: {
    minVersion: { type: String, default: null },
    maxVersion: { type: String, default: null },
  },
  screenSignatures: { type: [screenSignatureSubSchema], default: [] },
  esim: {
    support: { type: String, enum: esimSupportSchema.options, required: true },
    dualSim: { type: String, enum: dualSimModeSchema.options, required: true },
    maxProfiles: { type: Number, default: null },
    conditions: { type: [esimConditionSubSchema], default: [] },
    clarifyingQuestion: { type: esimClarifyingQuestionSubSchema, default: null },
    notes: { type: String, default: '' },
  },
  releaseYear: { type: Number, required: true },
  marketPresenceRu: { type: String, enum: marketPresenceRuSchema.options, required: true },
  popularity: { type: Number, required: true },
  sources: { type: [deviceSourceSubSchema], default: [] },
  dataConfidence: { type: String, enum: dataConfidenceSchema.options, required: true },
  provenance: {
    source: { type: String, required: true },
    batchId: { type: String, default: null },
    importedAt: { type: Date, required: true },
    agreementCount: { type: Number, default: null },
  },
  status: { type: String, enum: deviceStatusSchema.options, required: true },
  // НЕ помечены `required: true`, хотя тип `Device` требует их всегда — `timestamps: true`
  // ниже сам заполняет оба поля, а `required` конфликтует с порядком применения плагина
  // (проверено эмпирически, catalog.integration.spec.ts; та же оговорка — в catalog-override.schema.ts).
  createdAt: { type: Date },
  updatedAt: { type: Date },
};

export const deviceMongooseSchema = new Schema<Device>(deviceSchemaDefinition, {
  collection: DEVICE_COLLECTION_NAME,
  timestamps: true,
  _id: false,
});

/**
 * Индексы коллекции `devices` (docs/05 §5.7). `modelCodes`/`aliases` — точный поиск (горячий
 * путь Android/резервный текстовый поиск); `brand`+`family`+`generation` — отбор кандидатов при
 * слотовом разборе; `platform`+`status` — выборки для прогрева кэша (`CatalogModule`).
 */
deviceMongooseSchema.index({ modelCodes: 1 });
deviceMongooseSchema.index({ brand: 1, family: 1, generation: 1 });
deviceMongooseSchema.index({ aliases: 1 });
deviceMongooseSchema.index({ marketingName: 'text', aliases: 'text' });
deviceMongooseSchema.index({ platform: 1, status: 1 });

export type DeviceDocument = HydratedDocument<Device>;
export type DeviceModel = Model<Device>;

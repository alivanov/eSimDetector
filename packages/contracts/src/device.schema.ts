import { z } from 'zod';

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
} from './enums';

/**
 * Схема записи справочника устройств (docs/05-data-model.md, §5.3—5.4) — единственное
 * объявление домена «устройство», из которого выводится тип TypeScript (`z.infer`, ADR-011).
 * Схема Mongoose (apps/api/src/modules/catalog/schemas) типизируется этим же выведенным типом
 * и проверяется на соответствие отдельным тестом — правило не расходится по двум местам молча.
 *
 * ADR-016: это схема ВАЛИДАЦИИ внешних данных (курируемые файлы `data/catalog/`, импорт CSV,
 * решения модератора) — тип предметной области появляется только после `deviceSchema.parse`,
 * а не через утверждение `as`.
 */

export const osVersionRangeSchema = z.object({
  /** Диапазон ФАКТИЧЕСКИ вышедших версий ОС (docs/05 §5.3) — не обещанный вендором срок поддержки. */
  minVersion: z.string().min(1).nullable(),
  maxVersion: z.string().min(1).nullable(),
});
export type OsVersionRange = z.infer<typeof osVersionRangeSchema>;

export const deviceScreenSignatureSchema = z.object({
  cssWidth: z.number().int().positive(),
  cssHeight: z.number().int().positive(),
  dpr: z.number().positive(),
  /** Экран в режиме «Увеличенный» (Display Zoom) — docs/03-detection-algorithm.md §3.5, шаг 3. */
  zoomed: z.boolean(),
});
export type DeviceScreenSignature = z.infer<typeof deviceScreenSignatureSchema>;

/**
 * Одно исключение из статуса `esim.support` (docs/05 §5.4). `scope`/`value` определяют, при
 * каком контексте применяется исключение; семантика сравнения — `packages/esim-rules/src/conditions.ts`.
 * `support` внутри условия не допускает `conditional` (см. `esimConditionSupportSchema`).
 */
export const esimConditionSchema = z.object({
  scope: esimConditionScopeSchema,
  value: z.string().min(1),
  support: esimConditionSupportSchema,
  note: z.string().min(1),
});
export type EsimCondition = z.infer<typeof esimConditionSchema>;

export const esimClarifyingOptionSchema = z.object({
  value: z.string().min(1),
  label: z.string().min(1),
});
export type EsimClarifyingOption = z.infer<typeof esimClarifyingOptionSchema>;

/**
 * Вопрос пользователю для разрешения `conditional` (docs/05 §5.4, ADR-007). Docs фиксируют
 * назначение поля, но не буквальную форму объекта — форма ниже введена этим агентом и
 * зафиксирована как решение (см. отчёт агента 3, docs/05 §5.4).
 */
export const esimClarifyingQuestionSchema = z.object({
  /** Совпадает с `esimConditionScopeSchema` — вопрос закрывает ровно один `scope` условий записи. */
  kind: esimConditionScopeSchema,
  question: z.string().min(1),
  options: z.array(esimClarifyingOptionSchema).min(1),
});
export type EsimClarifyingQuestion = z.infer<typeof esimClarifyingQuestionSchema>;

export const esimInfoSchema = z.object({
  support: esimSupportSchema,
  dualSim: dualSimModeSchema,
  maxProfiles: z.number().int().positive().nullable(),
  conditions: z.array(esimConditionSchema),
  clarifyingQuestion: esimClarifyingQuestionSchema.nullable(),
  notes: z.string(),
});
export type EsimInfo = z.infer<typeof esimInfoSchema>;

export const deviceSourceSchema = z.object({
  url: z.string().min(1),
  title: z.string().min(1),
  checkedAt: z.coerce.date(),
});
export type DeviceSource = z.infer<typeof deviceSourceSchema>;

/**
 * Происхождение записи (docs/05 §5.3). `source` — свободная строка вида `llm:model-a`,
 * `curated`, `rule:apple-generation`, `moderator:<логин>` (докладывается конвейером агента 4,
 * этот пакет только фиксирует форму поля). `agreementCount` — число независимых источников,
 * согласившихся при консенсусе (docs/14 §14.4 шаг 5); `null`, когда шаг консенсуса неприменим
 * (курируемое ядро, решение модератора, детерминированное правило).
 */
export const deviceProvenanceSchema = z.object({
  source: z.string().min(1),
  batchId: z.string().min(1).nullable(),
  importedAt: z.coerce.date(),
  agreementCount: z.number().int().nonnegative().nullable(),
});
export type DeviceProvenance = z.infer<typeof deviceProvenanceSchema>;

export const deviceSchema = z.object({
  _id: z.string().min(1),
  brand: z.string().min(1),
  brandTitle: z.string().min(1),
  marketingName: z.string().min(1),
  displayName: z.string().min(1),
  family: z.string().min(1),
  generation: z.number().int().nullable(),
  modifiers: z.array(z.string().min(1)),
  modelCodes: z.array(z.string().min(1)),
  aliases: z.array(z.string().min(1)),
  platform: platformSchema,
  deviceType: deviceTypeSchema,
  os: osVersionRangeSchema,
  screenSignatures: z.array(deviceScreenSignatureSchema),
  esim: esimInfoSchema,
  releaseYear: z.number().int().min(2007),
  marketPresenceRu: marketPresenceRuSchema,
  popularity: z.number(),
  sources: z.array(deviceSourceSchema),
  dataConfidence: dataConfidenceSchema,
  provenance: deviceProvenanceSchema,
  status: deviceStatusSchema,
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

/**
 * Тип предметной области «устройство справочника» (docs/05 §5.3) — единственное объявление
 * (ADR-011): и Mongoose-схема (`apps/api/src/modules/catalog/schemas/device.schema.ts`), и
 * все пакеты, работающие с записью справочника (`esim-rules`, будущие `matching`/`detection`),
 * используют именно этот тип, выведенный из `deviceSchema` через `z.infer`, а не собственное
 * объявление интерфейса.
 */
export type Device = z.infer<typeof deviceSchema>;

/** Валидирует внешние данные (файл каталога, документ MongoDB, строка после импорта) и возвращает `Device`. */
export function parseDevice(input: unknown): Device {
  return deviceSchema.parse(input);
}

export interface ParseDeviceResult {
  readonly success: boolean;
  readonly device?: Device;
  readonly error?: z.ZodError;
}

/** Безопасный разбор без исключения — для конвейеров, которым нужно собрать все ошибки (агент 4). */
export function safeParseDevice(input: unknown): ParseDeviceResult {
  const result = deviceSchema.safeParse(input);
  if (result.success) {
    return { success: true, device: result.data };
  }
  return { success: false, error: result.error };
}

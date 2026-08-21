import { z } from 'zod';

import { platformSchema, resultStatusSchema } from './enums';

/**
 * Единая очередь задач модерации (docs/15-moderation.md, §15.2; docs/05-data-model.md §5.6) —
 * семь типов, дедуплицированные по составному ключу `kind`+`key` со счётчиком обращений
 * `occurrences` (§5.7: индекс уникальности именно на этой паре). Docs фиксируют назначение
 * каждого типа и то, что показывается модератору, но не буквальную форму документа — она
 * введена этим агентом (этап 7) по тому же принципу, что и `CatalogOverride` (агент 3):
 * дискриминированное объединение по `kind`, а не общий `Record<string, unknown>` — недоверенным
 * внешним данным здесь взяться неоткуда (задачи создаёт только код сервиса), но конкретный
 * состав полезной нагрузки каждого типа документирован и проверяем компилятором, а не только
 * комментарием (ADR-016: тип появляется после разбора схемой, а не после `as`).
 */
export const moderationTaskKindSchema = z.enum([
  'unknown_model_code',
  'unknown_screen_signature',
  'unmatched_query',
  'ambiguous_query',
  'csv_quarantine',
  'source_disagreement',
  'user_feedback',
]);
export type ModerationTaskKind = z.infer<typeof moderationTaskKindSchema>;

export const moderationTaskStatusSchema = z.enum(['open', 'resolved', 'rejected']);
export type ModerationTaskStatus = z.infer<typeof moderationTaskStatusSchema>;

/** `unknown_model_code` (docs/15 §15.2): `Sec-CH-UA-Model` не найден в справочнике. */
export const unknownModelCodePayloadSchema = z.object({
  code: z.string().min(1),
  platform: platformSchema,
  /** Бренд, распознанный по шаблону кода (docs/14 §14.7: «частичное распознавание») — `null`, если шаблон не совпал ни с одним известным вендором. */
  brandGuess: z.string().min(1).nullable(),
});
export type UnknownModelCodePayload = z.infer<typeof unknownModelCodePayloadSchema>;

/** `unknown_screen_signature` (docs/15 §15.2): сигнатура экрана iOS не найдена. */
export const unknownScreenSignaturePayloadSchema = z.object({
  signature: z.string().min(1),
  cssWidth: z.number().int().positive(),
  cssHeight: z.number().int().positive(),
  dpr: z.number().positive(),
  zoomed: z.boolean(),
  osVersion: z.string().min(1).nullable(),
});
export type UnknownScreenSignaturePayload = z.infer<typeof unknownScreenSignaturePayloadSchema>;

/** `unmatched_query` (docs/15 §15.2): текстовый запрос не сопоставлен ни с одним устройством. */
export const unmatchedQueryPayloadSchema = z.object({
  rawQuery: z.string().min(1),
  normalizedQuery: z.string(),
});
export type UnmatchedQueryPayload = z.infer<typeof unmatchedQueryPayloadSchema>;

/** `ambiguous_query` (docs/15 §15.2): запрос устойчиво уходит в уточнение. */
export const ambiguousQueryPayloadSchema = z.object({
  rawQuery: z.string().min(1),
  normalizedQuery: z.string(),
  candidateIds: z.array(z.string().min(1)),
});
export type AmbiguousQueryPayload = z.infer<typeof ambiguousQueryPayloadSchema>;

/** `csv_quarantine` (docs/15 §15.2): строка выгрузки не прошла валидацию при импорте (docs/14 §14.3). */
export const csvQuarantinePayloadSchema = z.object({
  code: z.string().min(1),
  source: z.string().min(1),
  batchId: z.string().min(1),
  lineNumber: z.number().int().nonnegative(),
  detail: z.string().min(1),
  rawBrand: z.string().optional(),
  rawMarketingName: z.string().optional(),
});
export type CsvQuarantinePayload = z.infer<typeof csvQuarantinePayloadSchema>;

/** `source_disagreement` (docs/15 §15.2, docs/14 §14.4 шаг 5): источники расходятся по статусу eSIM. */
export const sourceDisagreementVariantSchema = z.object({
  source: z.string().min(1),
  esimSupport: z.enum(['yes', 'no', 'conditional']),
});
export const sourceDisagreementPayloadSchema = z.object({
  deviceId: z.string().min(1),
  variants: z.array(sourceDisagreementVariantSchema).min(1),
});
export type SourceDisagreementPayload = z.infer<typeof sourceDisagreementPayloadSchema>;

/** `user_feedback` (docs/15 §15.2): пользователь сообщил о неверном результате (`POST /api/v1/feedback`). */
export const userFeedbackPayloadSchema = z.object({
  requestId: z.string().min(1),
  reportedStatus: resultStatusSchema,
  deviceId: z.string().min(1).nullable(),
  comment: z.string().min(1),
  /** Сигналы устройства, приложенные клиентом добровольно — для разбора модератором (docs/15 §15.2: «сигналы»). */
  signalsSummary: z.string().nullable(),
});
export type UserFeedbackPayload = z.infer<typeof userFeedbackPayloadSchema>;

const moderationTaskCommonFields = {
  occurrences: z.number().int().positive(),
  status: moderationTaskStatusSchema,
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  lastSeenAt: z.coerce.date(),
  resolvedAt: z.coerce.date().nullable(),
  resolvedBy: z.string().min(1).nullable(),
  resolutionNote: z.string().nullable(),
};

/**
 * `key` — дедупликация в пределах `kind` (docs/15 §15.2, docs/05 §5.7: индекс уникальный
 * составной `kind`+`key`). Смысл ключа зависит от типа: нормализованный код модели, ключ
 * сигнатуры экрана, нормализованный текст запроса, `deviceId` расхождения источников и т. д. —
 * конкретное значение вычисляет вызывающая сторона (`ModerationTaskService`), схема лишь
 * требует непустой строки.
 */
export const moderationTaskSchema = z.discriminatedUnion('kind', [
  z.object({
    _id: z.string().min(1),
    kind: z.literal('unknown_model_code'),
    key: z.string().min(1),
    payload: unknownModelCodePayloadSchema,
    ...moderationTaskCommonFields,
  }),
  z.object({
    _id: z.string().min(1),
    kind: z.literal('unknown_screen_signature'),
    key: z.string().min(1),
    payload: unknownScreenSignaturePayloadSchema,
    ...moderationTaskCommonFields,
  }),
  z.object({
    _id: z.string().min(1),
    kind: z.literal('unmatched_query'),
    key: z.string().min(1),
    payload: unmatchedQueryPayloadSchema,
    ...moderationTaskCommonFields,
  }),
  z.object({
    _id: z.string().min(1),
    kind: z.literal('ambiguous_query'),
    key: z.string().min(1),
    payload: ambiguousQueryPayloadSchema,
    ...moderationTaskCommonFields,
  }),
  z.object({
    _id: z.string().min(1),
    kind: z.literal('csv_quarantine'),
    key: z.string().min(1),
    payload: csvQuarantinePayloadSchema,
    ...moderationTaskCommonFields,
  }),
  z.object({
    _id: z.string().min(1),
    kind: z.literal('source_disagreement'),
    key: z.string().min(1),
    payload: sourceDisagreementPayloadSchema,
    ...moderationTaskCommonFields,
  }),
  z.object({
    _id: z.string().min(1),
    kind: z.literal('user_feedback'),
    key: z.string().min(1),
    payload: userFeedbackPayloadSchema,
    ...moderationTaskCommonFields,
  }),
]);

export type ModerationTask = z.infer<typeof moderationTaskSchema>;

export function parseModerationTask(input: unknown): ModerationTask {
  return moderationTaskSchema.parse(input);
}

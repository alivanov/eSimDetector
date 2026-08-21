import type { ModerationTask } from '@esim-detector/contracts';
import { moderationTaskKindSchema, moderationTaskStatusSchema } from '@esim-detector/contracts';
import { Schema, type HydratedDocument, type Model } from 'mongoose';

/**
 * Mongoose-схема коллекции `moderation_tasks` (docs/05-data-model.md §5.6, §5.7; docs/15-moderation.md
 * §15.2). `payload` хранится как `Schema.Types.Mixed` — форма зависит от `kind` (дискриминированное
 * объединение `moderationTaskSchema` в `@esim-detector/contracts`), реальная валидация выполняется
 * `moderationTaskSchema.parse` на чтении (`ModerationTaskService`), симметрично тому, как
 * `catalog-override.schema.ts` (агент 3) уже хранит свой `patch` через `Mixed`.
 */
export const MODERATION_TASK_MODEL_NAME = 'ModerationTask';
export const MODERATION_TASK_COLLECTION_NAME = 'moderation_tasks';

const moderationTaskDefinition = {
  kind: { type: String, enum: moderationTaskKindSchema.options, required: true },
  key: { type: String, required: true },
  payload: { type: Schema.Types.Mixed, required: true },
  occurrences: { type: Number, required: true, default: 1 },
  status: {
    type: String,
    enum: moderationTaskStatusSchema.options,
    required: true,
    default: 'open',
  },
  lastSeenAt: { type: Date, required: true },
  resolvedAt: { type: Date, default: null },
  resolvedBy: { type: String, default: null },
  resolutionNote: { type: String, default: null },
  // `createdAt`/`updatedAt` заполняются плагином `timestamps` ниже — не помечены `required`
  // по той же причине, что и в `catalog-override.schema.ts` (агент 3): порядок применения плагина.
  createdAt: { type: Date },
  updatedAt: { type: Date },
};

export const moderationTaskMongooseSchema = new Schema(moderationTaskDefinition, {
  collection: MODERATION_TASK_COLLECTION_NAME,
  timestamps: true,
});

/** Дедупликация — уникальный составной индекс (docs/05 §5.7). */
moderationTaskMongooseSchema.index({ kind: 1, key: 1 }, { unique: true });
/** Очередь, отсортированная по частоте обращений (docs/05 §5.7, docs/15 §15.2). */
moderationTaskMongooseSchema.index({ status: 1, occurrences: -1 });

/**
 * TTL-индекс (docs/05-data-model.md §5.6/§5.7, дополнение к пункту объёма 6 передачи 7→8):
 * без него `moderation_tasks` растёт неограниченно от ПУБЛИЧНЫХ источников задач
 * (`unmatched_query`/`ambiguous_query` дедуплицируются по нормализованному тексту запроса,
 * `user_feedback` — по клиентскому `requestId`) — те же входы, для которых введён
 * `RateLimitGuard`, ограничивают ЧАСТОТУ создания задач, но не их суммарное число за месяцы
 * работы стенда.
 *
 * Индекс ЧАСТИЧНЫЙ и стоит на `resolvedAt`, а не на `createdAt`: открытая задача (`resolvedAt:
 * null`) не должна исчезать из очереди по возрасту — специалист обязан успеть её увидеть и
 * разобрать независимо от того, сколько она провисела (docs/15 §15.2: сортировка по частоте
 * обращений, а не по времени, — молчаливое устаревание нарушило бы этот принцип). `$type: "date"`
 * в `partialFilterExpression` включает в индекс только документы, где `resolvedAt` РЕАЛЬНО
 * заполнен (задача решена/отклонена) — `null` этому типу не соответствует.
 */
const MODERATION_TASK_RESOLVED_TTL_DAYS = 180;
const SECONDS_PER_DAY = 24 * 60 * 60;
moderationTaskMongooseSchema.index(
  { resolvedAt: 1 },
  {
    expireAfterSeconds: MODERATION_TASK_RESOLVED_TTL_DAYS * SECONDS_PER_DAY,
    partialFilterExpression: { resolvedAt: { $type: 'date' } },
  },
);

export type ModerationTaskDocument = HydratedDocument<ModerationTask>;
export type ModerationTaskModel = Model<ModerationTask>;

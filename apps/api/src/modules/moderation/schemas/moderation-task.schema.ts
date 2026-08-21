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

export type ModerationTaskDocument = HydratedDocument<ModerationTask>;
export type ModerationTaskModel = Model<ModerationTask>;

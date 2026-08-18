import {
  platformSchema,
  resultStatusSchema,
  type Platform,
  type ResultStatus,
} from '@esim-detector/contracts';
import { Schema, type HydratedDocument, type Model, type SchemaDefinition } from 'mongoose';

/**
 * Обезличенный журнал резолюций (docs/05-data-model.md, §5.6): `requestId`, хеш сигнатуры
 * сигналов (а не сами сигналы — приватность, docs/02 §2.7), платформа, результат, уверенность,
 * коды сработавших правил, длительность. TTL-индекс ограничивает срок хранения.
 *
 * Тип объявлен как обычный интерфейс TypeScript, а НЕ через `zod` в `@esim-detector/contracts`
 * (в отличие от `Device`/`ScreenSignatureRecord`, ADR-011): эта коллекция не является частью
 * контракта справочника (agent 3 её не описывал) и не проходит валидацию внешних данных — это
 * исключительно внутренний журнал, который пишет сам сервис, а не разбирает недоверенный ввод.
 */
export interface ResolutionLogEntry {
  readonly requestId: string;
  readonly signalsHash: string;
  readonly platform: Platform;
  readonly status: ResultStatus;
  readonly confidence: number;
  readonly reasonCodes: readonly string[];
  readonly durationMs: number;
  readonly createdAt: Date;
}

export const RESOLUTION_LOG_MODEL_NAME = 'ResolutionLog';
export const RESOLUTION_LOG_COLLECTION_NAME = 'resolution_logs';

/**
 * Значение по умолчанию (совпадает с `RESOLUTION_LOG_TTL_DAYS` из `config/env.schema.ts`),
 * запечённое в индекс на этапе определения схемы. Ограничение: смена `RESOLUTION_LOG_TTL_DAYS`
 * в уже работающем окружении не переопределяет `expireAfterSeconds` существующего индекса
 * автоматически — MongoDB требует `collMod` для изменения TTL действующего индекса. Для
 * демонстрационного контура (пересоздаваемая база при каждом развёртывании) это приемлемо;
 * задокументировано, чтобы не считаться забытым при эксплуатации в продакшене.
 */
const DEFAULT_TTL_DAYS = 30;
const SECONDS_PER_DAY = 24 * 60 * 60;

const resolutionLogDefinition: SchemaDefinition<ResolutionLogEntry> = {
  requestId: { type: String, required: true },
  signalsHash: { type: String, required: true },
  platform: { type: String, enum: platformSchema.options, required: true },
  status: { type: String, enum: resultStatusSchema.options, required: true },
  confidence: { type: Number, required: true },
  reasonCodes: { type: [String], default: [] },
  durationMs: { type: Number, required: true },
  createdAt: { type: Date },
};

export const resolutionLogMongooseSchema = new Schema<ResolutionLogEntry>(resolutionLogDefinition, {
  collection: RESOLUTION_LOG_COLLECTION_NAME,
  // Только createdAt — журнал не изменяется после записи (updatedAt не имеет смысла).
  timestamps: { createdAt: true, updatedAt: false },
});

resolutionLogMongooseSchema.index({ requestId: 1 });
resolutionLogMongooseSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: DEFAULT_TTL_DAYS * SECONDS_PER_DAY },
);

export type ResolutionLogDocument = HydratedDocument<ResolutionLogEntry>;
export type ResolutionLogModel = Model<ResolutionLogEntry>;

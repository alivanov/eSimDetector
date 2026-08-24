import { Schema, type HydratedDocument, type Model } from 'mongoose';

/**
 * Коллекция `eval_runs` — асинхронные прогоны стенда оценки качества из `/admin`
 * (план «Админка и главная» §1.3). Отчёт хранится в MongoDB, не на диске контейнера.
 */
export const EVAL_RUN_MODEL_NAME = 'EvalRun';
export const EVAL_RUN_COLLECTION_NAME = 'eval_runs';

export const EVAL_RUN_STATUSES = ['running', 'completed', 'failed'] as const;
export type EvalRunStatus = (typeof EVAL_RUN_STATUSES)[number];

export const EVAL_RUN_PHASES = ['detection', 'matching'] as const;
export type EvalRunPhase = (typeof EVAL_RUN_PHASES)[number];

export interface EvalRunProgress {
  readonly completed: number;
  readonly total: number;
  readonly phase: EvalRunPhase | null;
}

export interface EvalRunSummary {
  readonly detectionFalsePositives: number;
  readonly matchingFalsePositives: number;
  readonly detectionTotal: number;
  readonly matchingTotal: number;
  readonly falsePositives: number;
}

export interface EvalRunRecord {
  readonly status: EvalRunStatus;
  readonly progress: EvalRunProgress;
  readonly summary: EvalRunSummary | null;
  readonly reportMarkdown: string | null;
  readonly errorMessage: string | null;
  readonly startedAt: Date;
  readonly finishedAt: Date | null;
  readonly createdAt?: Date;
  readonly updatedAt?: Date;
}

const evalRunDefinition = {
  status: { type: String, enum: EVAL_RUN_STATUSES, required: true, default: 'running' },
  progress: {
    type: {
      completed: { type: Number, required: true, default: 0 },
      total: { type: Number, required: true, default: 0 },
      phase: { type: String, enum: [...EVAL_RUN_PHASES, null], default: null },
    },
    required: true,
  },
  summary: {
    type: {
      detectionFalsePositives: { type: Number },
      matchingFalsePositives: { type: Number },
      detectionTotal: { type: Number },
      matchingTotal: { type: Number },
      falsePositives: { type: Number },
    },
    default: null,
  },
  reportMarkdown: { type: String, default: null },
  errorMessage: { type: String, default: null },
  startedAt: { type: Date, required: true },
  finishedAt: { type: Date, default: null },
  createdAt: { type: Date },
  updatedAt: { type: Date },
};

export const evalRunMongooseSchema = new Schema(evalRunDefinition, {
  collection: EVAL_RUN_COLLECTION_NAME,
  timestamps: true,
});

evalRunMongooseSchema.index({ status: 1, createdAt: -1 });
evalRunMongooseSchema.index({ createdAt: -1 });

export type EvalRunDocument = HydratedDocument<EvalRunRecord>;
export type EvalRunModel = Model<EvalRunRecord>;

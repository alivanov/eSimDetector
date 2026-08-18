import type { ResultStatus } from '@esim-detector/contracts';

import type { HeaderConsistencyResult } from './header-consistency';

/**
 * Расчёт уверенности (docs/03-detection-algorithm.md, §3.6): величина в `[0, 1]`, складываемая
 * из вкладов подтверждающих сигналов, с фиксированными и документированными значениями.
 */
export const BASE_CONFIDENCE = {
  /** Точное совпадение сервисного кода модели (Android) — «решающее, уверенность высокая». */
  androidExactCode: 0.95,
  /** Модель распознана из устаревшего User-Agent — тот же источник менее надёжен. */
  androidLegacyUa: 0.85,
  /** Единый статус eSIM у ВСЕХ кандидатов, найденных и версией iOS, и сигнатурой экрана. */
  iosCandidatesAgreeBothSignals: 0.92,
  /** Единый статус, но использован только один из двух источников сужения (iOS-версия ИЛИ экран). */
  iosCandidatesAgreeSingleSignal: 0.85,
  /** Кандидаты расходятся в статусе — не должно пройти порог ответа (docs/03 §3.6: «обнуляющий»). */
  iosCandidatesDisagree: 0.4,
} as const;

/** «Повышающий»/понижающий вклад согласованности заголовков `Sec-CH-UA-*` (docs/03 §3.6). */
const HEADER_CONSISTENCY_BONUS = 0.03;
const HEADER_INCONSISTENCY_PENALTY = 0.1;

export function clampConfidence(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function applyHeaderConsistency(base: number, consistency: HeaderConsistencyResult): number {
  if (consistency === 'consistent') {
    return clampConfidence(base + HEADER_CONSISTENCY_BONUS);
  }
  if (consistency === 'inconsistent') {
    return clampConfidence(base - HEADER_INCONSISTENCY_PENALTY);
  }
  return base;
}

export interface ConfidenceGateInput {
  /** Статус, полученный от `esim-rules` (правила, условия, гейт достоверности данных). */
  readonly resolutionStatus: ResultStatus;
  readonly confidence: number;
  readonly answerThreshold: number;
}

export interface ConfidenceGateResult {
  readonly status: ResultStatus;
  /** `true`, когда именно недостаточная уверенность понизила определённый статус до уточнения. */
  readonly downgradedByConfidence: boolean;
}

/**
 * Финальный гейт (docs/03 §3.6: «при уверенности не ниже `CONFIDENCE_ANSWER_THRESHOLD` выдаётся
 * однозначный статус, иначе — `clarification_required`»). Если `esim-rules` уже вернул уточнение
 * (несогласие кандидатов, региональное условие, гейт достоверности данных), порог уверенности
 * ничего не меняет — там уже определённый результат "уточнение", а не "определено, но неуверенно".
 */
export function applyConfidenceGate(input: ConfidenceGateInput): ConfidenceGateResult {
  if (input.resolutionStatus === 'clarification_required') {
    return { status: 'clarification_required', downgradedByConfidence: false };
  }
  if (input.confidence < input.answerThreshold) {
    return { status: 'clarification_required', downgradedByConfidence: true };
  }
  return { status: input.resolutionStatus, downgradedByConfidence: false };
}

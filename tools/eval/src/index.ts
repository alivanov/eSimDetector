// Стенд оценки качества: docs/08-testing-and-quality.md, раздел 8.6.

// Схема `signals.golden.json` (docs/08 §8.4, ADR-037) — реэкспортирована здесь, чтобы у модуля
// был ровно один публичный вход (`@esim-detector/tools-eval`), а не прямой файловый импорт
// `tools/eval/src/signals-golden.ts` из потребителей вроде стенда отладки `apps/web` (этап 6.4,
// docs/03 §3.10): путь к внутреннему файлу пакета — деталь реализации, которая может измениться.
export type {
  SignalsGoldenCategory,
  SignalsGoldenSource,
  GoldenPlatform,
  GoldenDeviceType,
  GoldenStatus,
  GoldenUaData,
  GoldenScreenSignals,
  GoldenHardwareSignals,
  GoldenWebglSignals,
  GoldenSignals,
  GoldenExpectedOutcome,
  SignalsGoldenEntry,
  SignalsGoldenParseResult,
} from './signals-golden';
export { SIGNALS_GOLDEN_CATEGORIES, parseSignalsGolden } from './signals-golden';

export type { EvalProgress, EvalSuiteOptions } from './lib/eval-options';
export { resolveEvalCliOptions, resolveEvalOptions } from './lib/eval-options';
export { EVAL_REQUEST_INTERVAL_MS } from './lib/pace';
export type { DetectionEvalResult } from './run-detection-eval';
export { runDetectionEval } from './run-detection-eval';
export type { MatchingEvalResult } from './run-matching-eval';
export { runMatchingEval } from './run-matching-eval';
export type { EvalSuiteResult } from './run-eval-suite';
export { runEvalSuite } from './run-eval-suite';

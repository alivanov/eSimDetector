/**
 * Перечисляемые значения границы API, разобранные локально из строки, а не импортированные из
 * `@esim-detector/contracts` (docs/09-decisions.md ADR-037 — тот же принцип: то, что реально
 * приходит по сети, версионируется отдельно от внутреннего пакета сервера и переживает его
 * рефакторинг). Открытых множеств (`reasons[].code`) здесь нет — эти перечни закрыты контрактом
 * (docs/06-api-contract.md §6.1/§6.2). Множества `Set<string>` (не `Set<Platform>` и т. п.) —
 * тот же приём, что `tools/eval/src/signals-golden.ts`: `.has(value: string)` не требует
 * утверждения типа `as` на границе (ADR-016).
 */

export type ResultStatus = 'supported' | 'not_supported' | 'clarification_required';
const RESULT_STATUSES: readonly ResultStatus[] = [
  'supported',
  'not_supported',
  'clarification_required',
];
const RESULT_STATUSES_SET: ReadonlySet<string> = new Set(RESULT_STATUSES);
export function isResultStatus(value: unknown): value is ResultStatus {
  return typeof value === 'string' && RESULT_STATUSES_SET.has(value);
}

export type Platform = 'ios' | 'android' | 'harmonyos' | 'other';
const PLATFORMS: readonly Platform[] = ['ios', 'android', 'harmonyos', 'other'];
const PLATFORMS_SET: ReadonlySet<string> = new Set(PLATFORMS);
export function isPlatform(value: unknown): value is Platform {
  return typeof value === 'string' && PLATFORMS_SET.has(value);
}

export type DeviceType = 'phone' | 'tablet' | 'watch' | 'laptop' | 'other';
const DEVICE_TYPES: readonly DeviceType[] = ['phone', 'tablet', 'watch', 'laptop', 'other'];
const DEVICE_TYPES_SET: ReadonlySet<string> = new Set(DEVICE_TYPES);
export function isDeviceType(value: unknown): value is DeviceType {
  return typeof value === 'string' && DEVICE_TYPES_SET.has(value);
}

export type EsimSupport = 'supported' | 'not_supported' | 'conditional';
const ESIM_SUPPORTS: readonly EsimSupport[] = ['supported', 'not_supported', 'conditional'];
const ESIM_SUPPORTS_SET: ReadonlySet<string> = new Set(ESIM_SUPPORTS);
export function isEsimSupport(value: unknown): value is EsimSupport {
  return typeof value === 'string' && ESIM_SUPPORTS_SET.has(value);
}

export type DualSimMode = 'physical+esim' | 'dual-esim' | 'esim-only' | 'none';
const DUAL_SIM_MODES: readonly DualSimMode[] = ['physical+esim', 'dual-esim', 'esim-only', 'none'];
const DUAL_SIM_MODES_SET: ReadonlySet<string> = new Set(DUAL_SIM_MODES);
export function isDualSimMode(value: unknown): value is DualSimMode {
  return typeof value === 'string' && DUAL_SIM_MODES_SET.has(value);
}

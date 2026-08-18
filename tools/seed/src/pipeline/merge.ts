import type { Device } from '@esim-detector/contracts';
import { safeParseDevice } from '@esim-detector/contracts';
import { resolveAppleGenerationRule } from '@esim-detector/esim-rules';

import type { RowNotice } from '../domain/types';
import { toContractSupport } from './build-device';
import type { ConsensusDevice } from './consensus';

/**
 * Слияние с курируемым ядром (docs/14-catalog-ingestion.md §14.4 шаг 6). Приоритет источников
 * (`.cursor/rules/catalog-data.mdc`, от высшего к низшему): решение модератора (применяется
 * ОТДЕЛЬНО, на чтении — `CatalogModule`/`applyCatalogOverride`, не здесь) → курируемое ядро →
 * детерминированное правило → импорт из CSV. Эта функция реализует три нижних уровня: если
 * `id` есть в курируемом ядре — запись ядра побеждает целиком; иначе для Apple применяется
 * правило по перечню поколений (`resolveAppleGenerationRule`, `@esim-detector/esim-rules`) —
 * агент 4 использует готовую функцию, а не переписывает правило (АGENTS.md).
 */

export interface CuratedLoadResult {
  readonly devices: ReadonlyMap<string, Device>;
  readonly errors: readonly string[];
}

export function parseCuratedDevices(files: ReadonlyMap<string, unknown>): CuratedLoadResult {
  const devices = new Map<string, Device>();
  const errors: string[] = [];
  for (const [fileName, raw] of files) {
    const result = safeParseDevice(raw);
    if (!result.success || result.device === undefined) {
      errors.push(`${fileName}: не прошёл валидацию deviceSchema — ${String(result.error)}`);
      continue;
    }
    devices.set(result.device._id, result.device);
  }
  return { devices, errors };
}

export type MergeSource = 'curated' | 'rule:apple-generation' | 'import';

export interface MergeDecision {
  readonly source: MergeSource;
  /** Заполнено для `source: "curated"` — итоговая запись куратора используется как есть. */
  readonly curatedDevice?: Device;
  /** Заполнено для `source: "rule:apple-generation"` — статус, которым правило заменяет CSV-консенсус. */
  readonly ruleEsimSupport?: 'supported' | 'not_supported';
  readonly notices: readonly RowNotice[];
}

function isAppleIphone(device: ConsensusDevice): boolean {
  return device.representative.brand === 'apple' && device.representative.platform === 'ios';
}

export function decideMergeSource(
  device: ConsensusDevice,
  curatedDevices: ReadonlyMap<string, Device>,
): MergeDecision {
  const curated = curatedDevices.get(device.representative.id);
  if (curated !== undefined) {
    return { source: 'curated', curatedDevice: curated, notices: [] };
  }

  if (isAppleIphone(device)) {
    const ruleResult = resolveAppleGenerationRule({
      family: device.representative.family,
      generation: device.representative.generation,
      modifiers: device.representative.modifiers,
    });
    // Правило Apple по построению никогда не возвращает "conditional" (apple-generation-rule.ts:
    // resultOf вызывается только со "supported"/"not_supported"), но объявленный тип результата —
    // общий EsimSupport (3 значения) — сужаем явно, а не утверждением `as` (ADR-016).
    if (ruleResult.support === 'supported' || ruleResult.support === 'not_supported') {
      const notices: RowNotice[] = [];
      const csvSupport = toContractSupport(device.esimSupport);
      if (csvSupport !== ruleResult.support) {
        notices.push({
          code: 'APPLE_RULE_CONFLICT',
          deviceId: device.representative.id,
          detail: `CSV указывает "${csvSupport}" (${ruleResult.reason.detail ?? ruleResult.reason.code}), правило Apple — "${ruleResult.support}"; правило приоритетнее`,
        });
      }
      return { source: 'rule:apple-generation', ruleEsimSupport: ruleResult.support, notices };
    }
  }

  return { source: 'import', notices: [] };
}

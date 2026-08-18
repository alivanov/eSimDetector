import type { DataConfidence, EsimSupport } from '@esim-detector/contracts';
import type { FamilyEsimRule, FamilyRuleResolution } from '@esim-detector/esim-rules';
import { resolveFamilyRuleEsimStatus } from '@esim-detector/esim-rules';

/**
 * Агрегация правил уровня линейки (ADR-021, docs/14-catalog-ingestion.md §14.4 шаг 7) —
 * вычисляется агентом 4 из ПРИНЯТЫХ записей по паре «бренд + семейство», а не запрашивается
 * отдельной выгрузкой. Результат идёт ТОЛЬКО в отчёт об импорте (docs/14 §14.6) — правило само
 * не сохраняется отдельной коллекцией (ADR-021: «в конвейере появляется агрегация... и строка в
 * отчёте», агрегат воспроизводим из `devices` при каждом прогоне и не должен расходиться с ними).
 * Решение "что разрешено сделать с агрегатом при ответе пользователю" — `resolveFamilyRuleEsimStatus`
 * (`@esim-detector/esim-rules`), используется здесь как готовый строительный блок (AGENTS.md:
 * "не переписывай esim-rules... используй как готовые зависимости").
 */

export interface FamilyAggregateInput {
  readonly brand: string;
  readonly family: string;
  readonly esimSupport: EsimSupport;
  readonly dataConfidence: DataConfidence;
}

export interface FamilyAggregateReportEntry {
  readonly rule: FamilyEsimRule;
  readonly resolution: FamilyRuleResolution;
}

const CONFIDENCE_RANK: Readonly<Record<DataConfidence, number>> = {
  quarantined: 0,
  unverified: 1,
  derived: 2,
  verified: 3,
};

function aggregateConfidence(records: readonly FamilyAggregateInput[]): DataConfidence {
  return records.every((record) => record.dataConfidence === 'verified') ? 'verified' : 'derived';
}

function aggregateStatus(
  records: readonly FamilyAggregateInput[],
): 'supported' | 'not_supported' | 'mixed' {
  const distinct = new Set(records.map((record) => record.esimSupport));
  if (distinct.size === 1) {
    const [only] = distinct;
    if (only === 'supported' || only === 'not_supported') {
      return only;
    }
    // "conditional" в единственном числе не сводится ни к одному из двух значений правила
    // уровня линейки (`FamilyEsimAggregateStatus` не включает "conditional") — считается смешанным.
    return 'mixed';
  }
  return 'mixed';
}

/**
 * @param minRecords минимальное число записей уровня не ниже `derived` в линейке — параметр
 * импорта, а не константа кода (docs/14 §14.4 шаг 7).
 * @param moderatorConfirmedNotSupported множество `"бренд|семейство"`, для которых специалист
 * ПОДТВЕРДИЛ `not_supported` (ADR-021) — источник этого множества не существует на момент
 * реализации агента 4 (нет коллекции решений по линейкам), параметр пуст по умолчанию и
 * зарезервирован для будущей интеграции с очередью модерации (агент 7).
 */
export function computeFamilyAggregates(
  devices: readonly FamilyAggregateInput[],
  minRecords: number,
  moderatorConfirmedNotSupported: ReadonlySet<string> = new Set(),
): readonly FamilyAggregateReportEntry[] {
  const eligible = devices.filter((device) => CONFIDENCE_RANK[device.dataConfidence] >= CONFIDENCE_RANK.derived);

  const groups = new Map<string, FamilyAggregateInput[]>();
  for (const device of eligible) {
    const key = `${device.brand}|${device.family}`;
    const bucket = groups.get(key) ?? [];
    bucket.push(device);
    groups.set(key, bucket);
  }

  const entries: FamilyAggregateReportEntry[] = [];
  for (const [key, records] of groups) {
    if (records.length < minRecords) {
      continue;
    }
    const first = records[0];
    if (first === undefined) {
      continue;
    }
    const rule: FamilyEsimRule = {
      brand: first.brand,
      family: first.family,
      status: aggregateStatus(records),
      dataConfidence: aggregateConfidence(records),
      recordCount: records.length,
      moderatorConfirmed: moderatorConfirmedNotSupported.has(key),
    };
    entries.push({ rule, resolution: resolveFamilyRuleEsimStatus(rule) });
  }

  return entries;
}

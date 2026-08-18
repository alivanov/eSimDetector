/**
 * Сверка с эталоном (docs/14-catalog-ingestion.md §14.4 шаг 4) — `data/fixtures/catalog.reference.json`.
 * Файл ОТСУТСТВУЕТ на момент реализации агента 4 (docs/12-open-questions.md, вопрос 13 —
 * не решён, не в объёме этого агента): этот модуль реализует МЕХАНИЗМ и корректно работает и
 * на пустом эталоне (сверка просто не даёт покрытия), и на заполненном — без изменения кода,
 * когда файл появится (агент, отвечающий за курирование данных, положит его на то же место).
 */

export type ReferenceEsimSupport = 'yes' | 'no' | 'conditional';

export interface ReferenceEntry {
  readonly id: string;
  readonly esimSupport: ReferenceEsimSupport;
  readonly note?: string;
}

export type ReferenceMap = ReadonlyMap<string, ReferenceEntry>;

export type ReferenceParseResult =
  | { readonly ok: true; readonly value: ReferenceMap }
  | { readonly ok: false; readonly errors: readonly string[] };

const SUPPORT_VALUES: readonly ReferenceEsimSupport[] = ['yes', 'no', 'conditional'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSupportValue(value: unknown): value is ReferenceEsimSupport {
  return typeof value === 'string' && SUPPORT_VALUES.some((allowed) => allowed === value);
}

/** Разбор `catalog.reference.json` из недоверенных внешних данных (ADR-016: без утверждений `as`). */
export function parseReferenceFile(value: unknown): ReferenceParseResult {
  if (!Array.isArray(value)) {
    return { ok: false, errors: ['catalog.reference.json: ожидался массив записей'] };
  }

  const errors: string[] = [];
  const entries = new Map<string, ReferenceEntry>();

  value.forEach((item, index) => {
    if (!isRecord(item)) {
      errors.push(`[${index}]: ожидался объект`);
      return;
    }
    const { id, esimSupport, note } = item;
    if (typeof id !== 'string' || id.trim().length === 0) {
      errors.push(`[${index}].id: ожидалась непустая строка`);
      return;
    }
    if (!isSupportValue(esimSupport)) {
      errors.push(`[${index}].esimSupport: ожидалось одно из ${SUPPORT_VALUES.join('/')}`);
      return;
    }
    if (note !== undefined && typeof note !== 'string') {
      errors.push(`[${index}].note: ожидалась строка`);
      return;
    }
    entries.set(id, { id, esimSupport, ...(typeof note === 'string' ? { note } : {}) });
  });

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, value: entries };
}

export interface ReferenceMismatch {
  readonly id: string;
  readonly expected: ReferenceEsimSupport;
  readonly actual: ReferenceEsimSupport;
}

export interface ReferenceComparisonResult {
  readonly skipped: boolean;
  readonly intersectionSize: number;
  readonly mismatches: readonly ReferenceMismatch[];
  readonly mismatchRate: number;
}

export interface ReferenceCandidateLike {
  readonly id: string;
  readonly esimSupport: 'yes' | 'no' | 'conditional' | 'unknown';
}

export interface ReferenceCheckResult<T extends ReferenceCandidateLike> {
  readonly accepted: readonly T[];
  readonly contradicting: readonly T[];
  readonly matchedCount: number;
  readonly checkedCount: number;
}

/**
 * Применяется К СТРОКАМ ОДНОГО ИСТОЧНИКА ДО консенсуса (docs/14 §14.4, диаграмма: P3 → P4 → P5,
 * P4 -.-> карантин "противоречит эталону") — а не к уже согласованному результату шага 5: сверка
 * с эталоном измеряет качество КАЖДОГО источника отдельно, поэтому должна видеть решение
 * источника раньше, чем оно смешается с другими в консенсусе.
 */
export function applyReferenceCheck<T extends ReferenceCandidateLike>(
  candidates: readonly T[],
  reference: ReferenceMap | undefined,
): ReferenceCheckResult<T> {
  if (reference === undefined) {
    return { accepted: candidates, contradicting: [], matchedCount: 0, checkedCount: 0 };
  }

  const accepted: T[] = [];
  const contradicting: T[] = [];
  let matchedCount = 0;
  let checkedCount = 0;

  for (const candidate of candidates) {
    if (candidate.esimSupport === 'unknown') {
      accepted.push(candidate);
      continue;
    }
    const referenceEntry = reference.get(candidate.id);
    if (referenceEntry === undefined) {
      accepted.push(candidate);
      continue;
    }
    checkedCount += 1;
    if (referenceEntry.esimSupport === candidate.esimSupport) {
      matchedCount += 1;
      accepted.push(candidate);
    } else {
      contradicting.push(candidate);
    }
  }

  return { accepted, contradicting, matchedCount, checkedCount };
}

export function compareToReference(
  devices: ReadonlyMap<string, ReferenceEsimSupport>,
  reference: ReferenceMap | undefined,
): ReferenceComparisonResult {
  if (reference === undefined) {
    return { skipped: true, intersectionSize: 0, mismatches: [], mismatchRate: 0 };
  }

  const mismatches: ReferenceMismatch[] = [];
  let intersectionSize = 0;
  for (const [id, actual] of devices) {
    const referenceEntry = reference.get(id);
    if (referenceEntry === undefined) {
      continue;
    }
    intersectionSize += 1;
    if (referenceEntry.esimSupport !== actual) {
      mismatches.push({ id, expected: referenceEntry.esimSupport, actual });
    }
  }

  return {
    skipped: false,
    intersectionSize,
    mismatches,
    mismatchRate: intersectionSize === 0 ? 0 : mismatches.length / intersectionSize,
  };
}

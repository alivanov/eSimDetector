import type { DeviceCandidate, QuarantineEntry } from './types';

/**
 * Разрешение коллизий идентификатора и сервисных кодов среди кандидатов ОДНОГО источника
 * (docs/14-catalog-ingestion.md §14.4 шаг 2 и шаг 3): межисточниковый консенсус — отдельный
 * шаг (`consensus.ts`), сюда не входит.
 */

function buildQuarantineFromCandidate(
  code: QuarantineEntry['code'],
  candidate: DeviceCandidate,
  detail: string,
): QuarantineEntry {
  return {
    code,
    source: candidate.provenance.source,
    batchId: candidate.provenance.batchId,
    lineNumber: candidate.provenance.lineNumber,
    detail,
    rawBrand: candidate.brand,
    rawMarketingName: candidate.marketingName,
  };
}

/**
 * Слияние дубликатов идентификатора (docs/14 §14.4 шаг 2): разные написания одной модели
 * (`Galaxy S21` / `Galaxy S21 5G`) дают один `_id` — при совпадении статуса eSIM записи
 * объединяются и сохраняют оба набора сервисных кодов, при расхождении обе уходят в карантин
 * (`NAME_COLLISION_CONFLICT`).
 */
function mergeById(candidates: readonly DeviceCandidate[]): {
  merged: readonly DeviceCandidate[];
  quarantined: readonly QuarantineEntry[];
} {
  const byId = new Map<string, DeviceCandidate[]>();
  for (const candidate of candidates) {
    const bucket = byId.get(candidate.id) ?? [];
    bucket.push(candidate);
    byId.set(candidate.id, bucket);
  }

  const merged: DeviceCandidate[] = [];
  const quarantined: QuarantineEntry[] = [];

  for (const group of byId.values()) {
    const first = group[0];
    if (first === undefined) {
      continue;
    }
    if (group.length === 1) {
      merged.push(first);
      continue;
    }

    const distinctStatuses = new Set(group.map((candidate) => candidate.esimSupport));
    if (distinctStatuses.size > 1) {
      for (const candidate of group) {
        quarantined.push(
          buildQuarantineFromCandidate(
            'NAME_COLLISION_CONFLICT',
            candidate,
            `Идентификатор "${candidate.id}" встречается ${group.length} раз(а) с разным статусом eSIM в одном источнике`,
          ),
        );
      }
      continue;
    }

    const mergedCodes = [...new Set(group.flatMap((candidate) => candidate.modelCodes))];
    merged.push({ ...first, modelCodes: mergedCodes });
  }

  return { merged, quarantined };
}

/** `CODE_COLLISION` (docs/14 §14.3 таблица): один сервисный код не может принадлежать двум разным устройствам. */
function resolveCodeCollisions(candidates: readonly DeviceCandidate[]): {
  accepted: readonly DeviceCandidate[];
  quarantined: readonly QuarantineEntry[];
} {
  const ownerByCode = new Map<string, string>();
  const conflictingIds = new Set<string>();

  for (const candidate of candidates) {
    for (const code of candidate.modelCodes) {
      const normalizedCode = code.toUpperCase();
      const owner = ownerByCode.get(normalizedCode);
      if (owner === undefined) {
        ownerByCode.set(normalizedCode, candidate.id);
      } else if (owner !== candidate.id) {
        conflictingIds.add(owner);
        conflictingIds.add(candidate.id);
      }
    }
  }

  if (conflictingIds.size === 0) {
    return { accepted: candidates, quarantined: [] };
  }

  const accepted: DeviceCandidate[] = [];
  const quarantined: QuarantineEntry[] = [];
  for (const candidate of candidates) {
    if (conflictingIds.has(candidate.id)) {
      quarantined.push(
        buildQuarantineFromCandidate(
          'CODE_COLLISION',
          candidate,
          `Сервисный код(ы) устройства "${candidate.id}" встречается у другого устройства в этом источнике`,
        ),
      );
      continue;
    }
    accepted.push(candidate);
  }
  return { accepted, quarantined };
}

export function resolveCollisions(candidates: readonly DeviceCandidate[]): {
  readonly accepted: readonly DeviceCandidate[];
  readonly quarantined: readonly QuarantineEntry[];
} {
  const { merged, quarantined: idQuarantined } = mergeById(candidates);
  const { accepted, quarantined: codeQuarantined } = resolveCodeCollisions(merged);
  return { accepted, quarantined: [...idQuarantined, ...codeQuarantined] };
}

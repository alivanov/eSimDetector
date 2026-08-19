import type { NormalizationDictionary } from '@esim-detector/text-normalizer';

import { KNOWN_BRANDS } from '../domain/brands';
import { buildDeviceId } from '../domain/device-id';
import { parseMarketingNameSlots } from '../domain/marketing-name';
import { resolveSubbrandIdentity, type SubbrandMap } from '../domain/subbrands';
import type { DeviceCandidate, RowNotice } from '../domain/types';

/**
 * Слияние кандидатов, различающихся только тем, что подбренд (POCO, Redmi) назван написанием
 * бренда в одной выгрузке и написанием материнского бренда в другой (docs/09-decisions.md
 * ADR-029, ADR-023 п.6). Работает НАД ВСЕМ пулом кандидатов всех источников (после шагов 1–3,
 * до консенсуса — шаг 5, docs/14-catalog-ingestion.md §14.4) — только на этом уровне видны
 * кандидаты с РАЗНЫМИ `id`, которым предстоит стать ОДНОЙ записью.
 *
 * Слияние привязано к совпадению РЕАЛЬНОГО сервисного кода между кандидатами, а не к текстовому
 * совпадению названия само по себе: `poco-poco-f3` и `poco-f3` объединяются, только если у них
 * есть общий код (`M2012K11AG`) — это и есть требуемое доказательство того, что речь о одном
 * устройстве (AGENTS.md: "угадывать эквивалентность двух написаний одной модели нельзя ровно так
 * же, как угадывать статус eSIM"). Кандидаты без общего кода с "конкурентом" остаются как есть,
 * даже если формально попадают под правило подбренда — это открытый пробел (не увеличивает охват
 * сверх доказанного), а не риск ложного слияния.
 */

interface CandidateIdentity {
  readonly subbrand: string;
  readonly remainderKey: string;
  readonly remainderText: string;
}

export interface SubbrandMergeResult {
  readonly candidates: readonly DeviceCandidate[];
  readonly notices: readonly RowNotice[];
}

class UnionFind {
  private readonly parent = new Map<string, string>();

  find(id: string): string {
    const current = this.parent.get(id) ?? id;
    if (current === id) {
      return id;
    }
    const root = this.find(current);
    this.parent.set(id, root);
    return root;
  }

  union(a: string, b: string): void {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA !== rootB) {
      this.parent.set(rootA, rootB);
    }
  }
}

export function normalizeSubbrandCandidates(
  candidates: readonly DeviceCandidate[],
  subbrands: SubbrandMap,
  dictionary: NormalizationDictionary,
): SubbrandMergeResult {
  if (subbrands.size === 0) {
    return { candidates, notices: [] };
  }

  const identityById = new Map<string, CandidateIdentity>();
  const idsByCode = new Map<string, Set<string>>();

  for (const candidate of candidates) {
    if (identityById.has(candidate.id)) {
      continue;
    }
    const identity = resolveSubbrandIdentity(candidate.brand, candidate.marketingName, subbrands);
    if (identity === undefined) {
      continue;
    }
    identityById.set(candidate.id, identity);
  }

  for (const candidate of candidates) {
    if (!identityById.has(candidate.id)) {
      continue;
    }
    for (const code of candidate.modelCodes) {
      const key = code.toUpperCase();
      const bucket = idsByCode.get(key) ?? new Set<string>();
      bucket.add(candidate.id);
      idsByCode.set(key, bucket);
    }
  }

  const unionFind = new UnionFind();
  for (const ids of idsByCode.values()) {
    const idList = [...ids];
    for (let i = 0; i < idList.length; i += 1) {
      for (let j = i + 1; j < idList.length; j += 1) {
        const idA = idList[i];
        const idB = idList[j];
        if (idA === undefined || idB === undefined) {
          continue;
        }
        const identityA = identityById.get(idA);
        const identityB = identityById.get(idB);
        if (identityA === undefined || identityB === undefined) {
          continue;
        }
        if (
          identityA.subbrand === identityB.subbrand &&
          identityA.remainderKey === identityB.remainderKey
        ) {
          unionFind.union(idA, idB);
        }
      }
    }
  }

  const canonicalByRoot = new Map<
    string,
    { readonly subbrand: string; readonly remainderText: string; readonly originalIds: Set<string> }
  >();
  for (const [id, identity] of identityById) {
    const root = unionFind.find(id);
    const existing = canonicalByRoot.get(root);
    if (existing === undefined) {
      canonicalByRoot.set(root, {
        subbrand: identity.subbrand,
        remainderText: identity.remainderText,
        originalIds: new Set([id]),
      });
      continue;
    }
    existing.originalIds.add(id);
  }

  const notices: RowNotice[] = [];
  const rewritten = candidates.map((candidate): DeviceCandidate => {
    const canonical = canonicalByRoot.get(unionFind.find(candidate.id));
    if (canonical === undefined || canonical.originalIds.size < 2) {
      // Идентичность определена, но нет доказательства (общего кода) с другой записью — не трогаем.
      return candidate;
    }

    const brandTitle = KNOWN_BRANDS.get(canonical.subbrand) ?? canonical.subbrand;
    const id = buildDeviceId(canonical.subbrand, canonical.remainderText, dictionary);
    if (id === candidate.id) {
      return candidate;
    }

    const slots = parseMarketingNameSlots(canonical.subbrand, canonical.remainderText, dictionary);
    notices.push({
      code: 'SUBBRAND_ALIAS_MERGED',
      deviceId: id,
      detail: `"${candidate.brand} ${candidate.marketingName}" (id "${candidate.id}") сведено к подбренду "${canonical.subbrand}" по совпадению сервисного кода — новый id "${id}"`,
    });

    return {
      ...candidate,
      id,
      brand: canonical.subbrand,
      brandTitle,
      marketingName: canonical.remainderText,
      family: slots.family ?? candidate.family,
      generation: slots.generation ?? null,
      modifiers: slots.modifiers,
    };
  });

  return { candidates: rewritten, notices };
}

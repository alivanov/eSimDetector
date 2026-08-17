import type { MatcherDevice, QuerySlots } from './types';
import { computeBrandSimilarity } from './constraints';
import { editSimilarity } from './distance/levenshtein';
import { jaroWinklerSimilarity } from './distance/jaro-winkler';
import { buildDeviceTrigramKey } from './trigram/inverted-index';

/**
 * Оценка кандидата — взвешенная сумма шести составляющих таблицы docs/04-matching-algorithm.md,
 * §4.6. Нечёткие меры применяются ТОЛЬКО к бренду и семейству (AGENTS.md, предметное правило 2):
 * `familySimilarity` — единственная составляющая с реальным нечётким сравнением ТЕКСТА и основной
 * вклад в оценку; `brandMatch` тоже нечёткая мера (см. `computeBrandSimilarity`), но играет роль
 * жёсткого фильтра в `constraints.ts`, поэтому здесь всегда близка к максимуму — до `scoreCandidate`
 * доходят только кандидаты, уже прошедшие порог схожести бренда.
 *
 * `generationMatch` и `modifierSetMatch`, напротив, НЕ являются нечёткими мерами и не могут сами по
 * себе понизить оценку до отклонения кандидата — это сознательно (ADR-020): единственный механизм,
 * исключающий кандидата по цифре поколения или набору модификаторов — предикат `rejectCandidate`
 * (`constraints.ts`), выполняемый ДО этой функции. Обе составляющие возвращают `1`, когда информации
 * от запроса нет (совпадение по умолчанию) либо когда она есть и совпадает (иначе кандидат до этой
 * функции просто не дошёл бы) — то есть у кандидатов, реально дошедших до `scoreCandidate` в составе
 * конвейера `match.ts`, они всегда равны `1` и НЕ влияют на относительное ранжирование между
 * кандидатами ОДНОГО запроса (только на абсолютный уровень уверенности). Присутствуют в разбивке
 * ради прозрачности каждого ответа (ADR-010: «объяснение каждого ответа в машиночитаемом виде»), а
 * не как реальные различители, и посчитаны честно (не жёстко захардкожены в `1`), чтобы то же
 * значение было корректно и при вызове `scoreCandidate` в отрыве от `rejectCandidate` — например,
 * в модульных тестах самой функции.
 */
export interface ScoringWeights {
  readonly brandMatch: number;
  readonly generationMatch: number;
  readonly modifierSetMatch: number;
  readonly familySimilarity: number;
  readonly tokenCoverage: number;
  readonly popularity: number;
}

/**
 * Значения по умолчанию: `familySimilarity` — наибольший вес («основной вклад», docs/04 §4.6);
 * `popularity` — наименьший («малый вклад», разрешает только ничьи, docs/04 §4.6 и ranking.ts);
 * остальные — умеренный фиксированный вклад в АБСОЛЮТНЫЙ уровень уверенности (см. комментарий выше:
 * на относительное ранжирование внутри одного запроса они не влияют). Сумма — `1`, но
 * `scoreCandidate` не полагается на это и всегда нормирует по фактической сумме переданных весов.
 */
export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  brandMatch: 0.15,
  generationMatch: 0.15,
  modifierSetMatch: 0.1,
  familySimilarity: 0.4,
  tokenCoverage: 0.15,
  popularity: 0.05,
};

export interface MatchScoreBreakdown {
  readonly brandMatch: number;
  readonly generationMatch: number;
  readonly modifierSetMatch: number;
  readonly familySimilarity: number;
  readonly tokenCoverage: number;
  readonly popularity: number;
}

export interface ScoredCandidate {
  readonly device: MatcherDevice;
  readonly score: number;
  readonly breakdown: MatchScoreBreakdown;
}

export interface ScoreCandidateOptions {
  /**
   * Масштаб нормирования популярности в `[0, 1)` по формуле `popularity / (popularity + scale)`.
   * Не требует знания диапазона `MatcherDevice.popularity` во всём справочнике (пакет не хранит
   * состояние, ADR-005) — только неотрицательное число с самого устройства. По умолчанию `10`.
   */
  readonly popularityScale?: number;
}

const DEFAULT_POPULARITY_SCALE = 10;

/**
 * Текст запроса для нечёткого сравнения с устройством: бренд и семейство запроса, ОЧИЩЕННЫЕ от
 * цифры поколения и модификаторов (они и так не попадают в эти поля — `QuerySlots`, ADR-019) и
 * объединённые в одну строку — симметрично `buildDeviceTrigramKey` (`trigram/inverted-index.ts`),
 * который строит ключ устройства из тех же двух полей той же нормализованной формы. Симметрия
 * важна: `match.ts` использует этот же текст для отбора кандидатов по триграммному индексу (R2,
 * docs/04 §4.6), а здесь — для итоговой нечёткой оценки семейства уже отобранных кандидатов, и
 * оба шага обязаны видеть одинаковый текст запроса.
 *
 * Раздельное сравнение `slots.family` в отрыве от `slots.brand` работало бы плохо для запросов
 * вида `galaxy s23` (без слова `samsung`): по позиционной эвристике `text-normalizer` первым словом
 * становится `brand: 'galaxy'`, а в `family` остаётся лишь буква `'s'` — сравнение одного `'s'` с
 * `device.family` вроде `galaxy-s` даёт мизерную схожесть, хотя очевидно, что `galaxy` в `brand`
 * запроса — это и есть основа совпадения с семейством `galaxy-s`. Объединённый текст решает это.
 */
export function buildComparableQueryText(slots: QuerySlots): string {
  const parts: string[] = [];
  if (slots.brand !== undefined) {
    parts.push(slots.brand);
  }
  if (slots.family !== undefined && slots.family !== slots.brand) {
    parts.push(...slots.family.split('-'));
  }
  return parts.join(' ');
}

/**
 * Ветка сервисного кода (`slots.modelCode` задан) по построению `QuerySlots` не содержит
 * `brand`/`family` (ADR-019, text-normalizer): `buildComparableQueryText` для неё всегда пуст.
 * Но именно эта ветка — самый точный вид ввода (docs/04 §4.5), поэтому пустой текст здесь не
 * должен читаться как «текста нет, значит не похоже» (0), а должен читаться как «сравнивать
 * нечего, потому что сравнение уже произошло на уровне точного индекса кодов» — симметрично
 * `computeTokenCoverage`, которая по той же причине возвращает 1 для этой ветки.
 */
function computeFamilySimilarity(slots: QuerySlots, device: MatcherDevice): number {
  if (slots.modelCode !== undefined) {
    return 1;
  }
  const queryText = buildComparableQueryText(slots);
  if (queryText.length === 0) {
    return 0;
  }
  const deviceText = buildDeviceTrigramKey(device);
  return Math.max(
    editSimilarity(queryText, deviceText),
    jaroWinklerSimilarity(queryText, deviceText),
  );
}

function computeGenerationMatch(slots: QuerySlots, device: MatcherDevice): number {
  if (slots.generation === undefined) {
    return 1;
  }
  return device.generation !== null && device.generation === slots.generation ? 1 : 0;
}

function computeModifierSetMatch(slots: QuerySlots, device: MatcherDevice): number {
  if (slots.modifiers.length === 0) {
    return 1;
  }
  const deviceSet = new Set(device.modifiers);
  const querySet = new Set(slots.modifiers);
  if (deviceSet.size !== querySet.size) {
    return 0;
  }
  return slots.modifiers.every((modifier) => deviceSet.has(modifier)) ? 1 : 0;
}

/** Считает долю "распознанных" токенов запроса среди распознанных и неразобранных (docs/04 §4.6). */
function computeTokenCoverage(slots: QuerySlots): number {
  if (slots.modelCode !== undefined) {
    return 1;
  }

  const wordTokenCount =
    slots.brand === undefined
      ? 0
      : slots.family === undefined || slots.family === slots.brand
        ? 1
        : 1 + slots.family.split('-').length;

  const recognizedCount =
    wordTokenCount + (slots.generation !== undefined ? 1 : 0) + slots.modifiers.length;
  const totalCount = recognizedCount + slots.unparsed.length;

  return totalCount === 0 ? 0 : recognizedCount / totalCount;
}

function normalizePopularity(popularity: number, scale: number): number {
  if (popularity <= 0 || scale <= 0) {
    return 0;
  }
  return popularity / (popularity + scale);
}

function computeBrandMatch(slots: QuerySlots, device: MatcherDevice): number {
  return computeBrandSimilarity(slots, device) ?? 1;
}

/**
 * Оценивает одного кандидата (docs/04 §4.6). Вызывающий код (`match.ts`) обязан предварительно
 * пропустить кандидата через `rejectCandidate` (`constraints.ts`) — эта функция сама по себе не
 * исключает кандидатов, только считает разбивку и итоговую оценку.
 */
export function scoreCandidate(
  slots: QuerySlots,
  device: MatcherDevice,
  weights: ScoringWeights = DEFAULT_SCORING_WEIGHTS,
  options: ScoreCandidateOptions = {},
): ScoredCandidate {
  const popularityScale = options.popularityScale ?? DEFAULT_POPULARITY_SCALE;

  const breakdown: MatchScoreBreakdown = {
    brandMatch: computeBrandMatch(slots, device),
    generationMatch: computeGenerationMatch(slots, device),
    modifierSetMatch: computeModifierSetMatch(slots, device),
    familySimilarity: computeFamilySimilarity(slots, device),
    tokenCoverage: computeTokenCoverage(slots),
    popularity: normalizePopularity(device.popularity, popularityScale),
  };

  const weightSum =
    weights.brandMatch +
    weights.generationMatch +
    weights.modifierSetMatch +
    weights.familySimilarity +
    weights.tokenCoverage +
    weights.popularity;

  const rawScore =
    breakdown.brandMatch * weights.brandMatch +
    breakdown.generationMatch * weights.generationMatch +
    breakdown.modifierSetMatch * weights.modifierSetMatch +
    breakdown.familySimilarity * weights.familySimilarity +
    breakdown.tokenCoverage * weights.tokenCoverage +
    breakdown.popularity * weights.popularity;

  return {
    device,
    score: weightSum === 0 ? 0 : rawScore / weightSum,
    breakdown,
  };
}

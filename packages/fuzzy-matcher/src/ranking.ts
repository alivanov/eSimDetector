import type { ScoredCandidate } from './scoring';

/**
 * Ранжирование оценённых кандидатов (docs/04-matching-algorithm.md, §4.6). Сортировка по убыванию
 * итоговой оценки; при точном равенстве оценок — по убыванию априорной популярности устройства на
 * рынке РФ («разрешает только ничьи», docs/04 §4.6): популярность УЖЕ учтена как составляющая
 * оценки с малым весом (`scoring.ts`, `ScoringWeights.popularity`) и поэтому в подавляющем
 * большинстве случаев различает кандидатов ещё на этом этапе — сравнение здесь нужно как
 * детерминированная подстраховка на случай точного числового совпадения итоговых оценок (что
 * само по себе означало бы совпадение и `popularity`, если веса не нулевые, но остаётся отдельной,
 * не полагающейся на это допущение проверкой). Последний уровень — идентификатор устройства,
 * чтобы порядок был полностью детерминирован при равенстве и оценки, и популярности.
 */
export function rankCandidates(candidates: readonly ScoredCandidate[]): readonly ScoredCandidate[] {
  return [...candidates].sort((left, right) => {
    if (left.score !== right.score) {
      return right.score - left.score;
    }
    if (left.device.popularity !== right.device.popularity) {
      return right.device.popularity - left.device.popularity;
    }
    return left.device.id.localeCompare(right.device.id);
  });
}

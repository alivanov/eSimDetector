import type { MatcherDevice } from './types';
import type { MatchScoreBreakdown, ScoredCandidate } from './scoring';
import { rankCandidates } from './ranking';

function buildDevice(overrides: Partial<MatcherDevice> = {}): MatcherDevice {
  return {
    id: 'device',
    brand: 'samsung',
    family: 'galaxy-s',
    generation: 23,
    modifiers: [],
    modelCodes: [],
    aliases: [],
    marketingName: 'x',
    popularity: 1,
    ...overrides,
  };
}

const EMPTY_BREAKDOWN: MatchScoreBreakdown = {
  brandMatch: 1,
  generationMatch: 1,
  modifierSetMatch: 1,
  familySimilarity: 1,
  tokenCoverage: 1,
  popularity: 1,
};

// NB: не `Partial<ScoredCandidate> & { device?: Partial<MatcherDevice> }` — пересечение типов
// с одноимённым полем `device` в обеих частях требует, чтобы значение удовлетворяло ОБОИМ типам
// одновременно (`MatcherDevice & Partial<MatcherDevice>`), а не только частичному варианту.
interface CandidateOverrides {
  readonly device?: Partial<MatcherDevice>;
  readonly score?: number;
  readonly breakdown?: MatchScoreBreakdown;
}

function buildCandidate(overrides: CandidateOverrides = {}): ScoredCandidate {
  return {
    device: buildDevice(overrides.device),
    score: overrides.score ?? 0.5,
    breakdown: overrides.breakdown ?? EMPTY_BREAKDOWN,
  };
}

describe('rankCandidates', () => {
  it('сортирует по убыванию итоговой оценки', () => {
    const low = buildCandidate({ device: { id: 'low' }, score: 0.3 });
    const high = buildCandidate({ device: { id: 'high' }, score: 0.9 });
    const mid = buildCandidate({ device: { id: 'mid' }, score: 0.6 });

    const ranked = rankCandidates([low, high, mid]);

    expect(ranked.map((candidate) => candidate.device.id)).toEqual(['high', 'mid', 'low']);
  });

  it('при равной оценке разрешает ничью по убыванию популярности устройства', () => {
    const lessPopular = buildCandidate({ device: { id: 'a', popularity: 10 }, score: 0.5 });
    const morePopular = buildCandidate({ device: { id: 'b', popularity: 90 }, score: 0.5 });

    const ranked = rankCandidates([lessPopular, morePopular]);

    expect(ranked.map((candidate) => candidate.device.id)).toEqual(['b', 'a']);
  });

  it('при равной оценке и равной популярности сортирует по идентификатору устройства (детерминированность)', () => {
    const first = buildCandidate({ device: { id: 'zzz', popularity: 5 }, score: 0.5 });
    const second = buildCandidate({ device: { id: 'aaa', popularity: 5 }, score: 0.5 });

    const ranked = rankCandidates([first, second]);

    expect(ranked.map((candidate) => candidate.device.id)).toEqual(['aaa', 'zzz']);
  });

  it('не изменяет исходный массив (иммутабельность)', () => {
    const candidates = [
      buildCandidate({ device: { id: 'a' }, score: 0.1 }),
      buildCandidate({ device: { id: 'b' }, score: 0.9 }),
    ];
    const original = [...candidates];

    rankCandidates(candidates);

    expect(candidates).toEqual(original);
  });

  it('пустой список кандидатов даёт пустой результат', () => {
    expect(rankCandidates([])).toEqual([]);
  });
});

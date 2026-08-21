import type { MatcherDevice } from './types';
import type { MatchScoreBreakdown, ScoredCandidate } from './scoring';
import { DEFAULT_DECISION_THRESHOLDS, decide, type DecisionOptions } from './decision';

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

function candidate(id: string, score: number): ScoredCandidate {
  return { device: buildDevice({ id }), score, breakdown: EMPTY_BREAKDOWN };
}

const THRESHOLDS: DecisionOptions = { confidenceThreshold: 0.7, gapThreshold: 0.1 };

describe('decide — таблица решения docs/04 §4.7', () => {
  it('кандидатов нет → not_found с кодом DECISION_NO_CANDIDATES', () => {
    const decision = decide([], THRESHOLDS);

    expect(decision.status).toBe('not_found');
    expect(decision.candidates).toEqual([]);
    expect(decision.reasons).toEqual(['DECISION_NO_CANDIDATES']);
  });

  it('оценка лидера выше порога и разрыв со вторым значим → determined', () => {
    const decision = decide([candidate('leader', 0.95), candidate('second', 0.5)], THRESHOLDS);

    expect(decision.status).toBe('determined');
    expect(decision.candidates).toEqual([candidate('leader', 0.95)]);
    expect(decision.reasons).toEqual([]);
  });

  it('единственный кандидат выше порога уверенности → determined (разрыв не с кем считать)', () => {
    const decision = decide([candidate('only', 0.95)], THRESHOLDS);
    expect(decision.status).toBe('determined');
  });

  it('оценка лидера выше порога, но разрыв мал → clarification_required с кодом DECISION_GAP_TOO_SMALL', () => {
    const decision = decide([candidate('leader', 0.9), candidate('second', 0.85)], THRESHOLDS);

    expect(decision.status).toBe('clarification_required');
    expect(decision.reasons).toEqual(['DECISION_GAP_TOO_SMALL']);
    expect(decision.candidates.map((c) => c.device.id)).toEqual(['leader', 'second']);
  });

  it('оценка лидера ниже порога уверенности → clarification_required с кодом DECISION_BELOW_THRESHOLD', () => {
    const decision = decide([candidate('leader', 0.4), candidate('second', 0.1)], THRESHOLDS);

    expect(decision.status).toBe('clarification_required');
    expect(decision.reasons).toEqual(['DECISION_BELOW_THRESHOLD']);
  });

  it('список кандидатов для уточнения ограничен maxClarificationCandidates', () => {
    const many = Array.from({ length: 10 }, (_unused, index) =>
      candidate(`c${index}`, 0.5 - index * 0.001),
    );
    const decision = decide(many, {
      ...THRESHOLDS,
      confidenceThreshold: 0.9,
      maxClarificationCandidates: 3,
    });

    expect(decision.candidates).toHaveLength(3);
  });

  it('по умолчанию ограничивает уточнение пятью кандидатами (DEFAULT_DECISION_THRESHOLDS)', () => {
    expect(DEFAULT_DECISION_THRESHOLDS.maxClarificationCandidates).toBe(5);
  });
});

describe('decide — resolveEquivalenceKey (docs/04 §4.7: "если статус eSIM совпадает у всех кандидатов")', () => {
  it('без resolveEquivalenceKey разрыв мал → clarification_required как обычно', () => {
    const decision = decide([candidate('a', 0.9), candidate('b', 0.85)], THRESHOLDS);
    expect(decision.status).toBe('clarification_required');
  });

  it('все близкие кандидаты дают один и тот же ключ эквивалентности → determined с DECISION_RESOLVED_BY_EQUIVALENCE', () => {
    const decision = decide([candidate('a', 0.9), candidate('b', 0.85)], {
      ...THRESHOLDS,
      resolveEquivalenceKey: () => 'same-group',
    });

    expect(decision.status).toBe('determined');
    expect(decision.reasons).toEqual(['DECISION_RESOLVED_BY_EQUIVALENCE']);
    expect(decision.candidates).toHaveLength(2);
  });

  it('кандидаты дают РАЗНЫЕ ключи эквивалентности → уточнение всё равно требуется', () => {
    const decision = decide([candidate('a', 0.9), candidate('b', 0.85)], {
      ...THRESHOLDS,
      resolveEquivalenceKey: (deviceId) => deviceId,
    });

    expect(decision.status).toBe('clarification_required');
    expect(decision.reasons).toEqual(['DECISION_GAP_TOO_SMALL']);
  });

  it('работает и для ветки "ниже порога уверенности"', () => {
    const decision = decide([candidate('a', 0.3), candidate('b', 0.2)], {
      ...THRESHOLDS,
      resolveEquivalenceKey: () => 'same-group',
    });

    expect(decision.status).toBe('determined');
    expect(decision.reasons).toEqual(['DECISION_RESOLVED_BY_EQUIVALENCE']);
  });

  it('шесть близких кандидатов выше порога: первые пять с одним ключом, шестой с другим, при maxClarificationCandidates: 5 не дают determined', () => {
    const close = [
      candidate('a', 0.9),
      candidate('b', 0.89),
      candidate('c', 0.88),
      candidate('d', 0.87),
      candidate('e', 0.86),
      candidate('f', 0.85),
    ];
    const decision = decide(close, {
      ...THRESHOLDS,
      maxClarificationCandidates: 5,
      resolveEquivalenceKey: (deviceId) => (deviceId === 'f' ? 'other' : 'same-group'),
    });

    expect(decision.status).not.toBe('determined');
    expect(decision.candidates).toHaveLength(5);
  });

  it('шесть кандидатов ниже порога: первые пять с одним ключом, шестой с другим, при maxClarificationCandidates: 5 не дают determined', () => {
    const below = [
      candidate('a', 0.5),
      candidate('b', 0.49),
      candidate('c', 0.48),
      candidate('d', 0.47),
      candidate('e', 0.46),
      candidate('f', 0.45),
    ];
    const decision = decide(below, {
      ...THRESHOLDS,
      maxClarificationCandidates: 5,
      resolveEquivalenceKey: (deviceId) => (deviceId === 'f' ? 'other' : 'same-group'),
    });

    expect(decision.status).not.toBe('determined');
    expect(decision.candidates).toHaveLength(5);
  });
});

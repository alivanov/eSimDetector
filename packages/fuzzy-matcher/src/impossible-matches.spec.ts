/**
 * Тесты на невозможность ложного результата (docs/08-testing-and-quality.md, §8.2; AGENTS.md,
 * предметное правило 2; ADR-020). Формулируются как утверждения о ЗАПРЕЩЁННОМ поведении: каждый
 * кейс сначала показывает, что нечёткая мера САМА ПО СЕБЕ дала бы совпадение (расстояние между
 * `iPhone 12` и `iPhone 13` равно единице — docs/04 §4.2), и только затем — что `rejectCandidate`
 * (`constraints.ts`) отклоняет пару с ожидаемым кодом причины ДО того, как эта нечёткая мера вообще
 * успевает повлиять на результат.
 */
import type { MatcherDevice, QuerySlots } from './types';
import { editSimilarity } from './distance/levenshtein';
import { jaroWinklerSimilarity } from './distance/jaro-winkler';
import { rejectCandidate } from './constraints';
import { buildMatchIndex, matchQuery } from './match';
import type { ScoringWeights } from './scoring';

/** Порог, ниже которого пара строк обычно СЧИТАЛАСЬ БЫ схожей типичным нечётким поиском. */
const FUZZY_MATCH_THRESHOLD = 0.6;

function buildDevice(overrides: Partial<MatcherDevice> = {}): MatcherDevice {
  return {
    id: 'device',
    brand: 'apple',
    family: 'iphone',
    generation: 1,
    modifiers: [],
    modelCodes: [],
    aliases: [],
    marketingName: 'device',
    popularity: 1,
    ...overrides,
  };
}

function buildSlots(overrides: Partial<QuerySlots> = {}): QuerySlots {
  return {
    brand: 'iphone',
    family: 'iphone',
    modifiers: [],
    attributes: {},
    unparsed: [],
    ...overrides,
  };
}

describe('ЗАПРЕЩЕНО: iPhone 1 не сопоставляется с iPhone 11', () => {
  it('нечёткая мера расстояния сама по себе посчитала бы "iphone 1" и "iphone 11" похожими', () => {
    const similarity = editSimilarity('iphone 1', 'iphone 11');
    expect(similarity).toBeGreaterThan(FUZZY_MATCH_THRESHOLD);
  });

  it('rejectCandidate отклоняет пару с кодом REJECT_GENERATION_MISMATCH', () => {
    const slots = buildSlots({ generation: 1 });
    const device = buildDevice({ generation: 11 });

    const rejection = rejectCandidate(slots, device);

    expect(rejection?.code).toBe('REJECT_GENERATION_MISMATCH');
  });

  it('полный конвейор matchQuery не возвращает iPhone 11 как определённое устройство для запроса "iPhone 1"', () => {
    const iphone1 = buildDevice({ id: 'iphone-1', generation: 1 });
    const iphone11 = buildDevice({ id: 'iphone-11', generation: 11 });
    const index = buildMatchIndex([iphone1, iphone11]);

    const result = matchQuery(buildSlots({ generation: 1 }), index);

    expect(result.candidates.map((candidate) => candidate.device.id)).not.toContain('iphone-11');
  });
});

describe('ЗАПРЕЩЕНО: iPhone 12 не сопоставляется с iPhone 13', () => {
  it('нечёткая мера расстояния сама по себе посчитала бы "iphone 12" и "iphone 13" похожими', () => {
    const similarity = editSimilarity('iphone 12', 'iphone 13');
    expect(similarity).toBeGreaterThan(FUZZY_MATCH_THRESHOLD);
  });

  it('rejectCandidate отклоняет пару с кодом REJECT_GENERATION_MISMATCH', () => {
    const slots = buildSlots({ generation: 12 });
    const device = buildDevice({ generation: 13 });

    const rejection = rejectCandidate(slots, device);

    expect(rejection?.code).toBe('REJECT_GENERATION_MISMATCH');
  });

  it('полный конвейер matchQuery не возвращает iPhone 13 как определённое устройство для запроса "iPhone 12"', () => {
    const iphone12 = buildDevice({ id: 'iphone-12', generation: 12 });
    const iphone13 = buildDevice({ id: 'iphone-13', generation: 13 });
    const index = buildMatchIndex([iphone12, iphone13]);

    const result = matchQuery(buildSlots({ generation: 12 }), index);

    expect(result.status).toBe('determined');
    expect(result.candidates.map((candidate) => candidate.device.id)).toEqual(['iphone-12']);
  });
});

describe('ЗАПРЕЩЕНО: Pro не сопоставляется с Pro Max', () => {
  it('мера Джаро—Винклера сама по себе посчитала бы "pro" префиксом-совпадением с "pro max"', () => {
    const similarity = jaroWinklerSimilarity('pro', 'pro max');
    expect(similarity).toBeGreaterThan(FUZZY_MATCH_THRESHOLD);
  });

  it('rejectCandidate отклоняет пару с кодом REJECT_MODIFIER_SET_MISMATCH', () => {
    const slots = buildSlots({ generation: 13, modifiers: ['pro'] });
    const device = buildDevice({ generation: 13, modifiers: ['pro', 'max'] });

    const rejection = rejectCandidate(slots, device);

    expect(rejection?.code).toBe('REJECT_MODIFIER_SET_MISMATCH');
  });

  it('полный конвейер matchQuery не возвращает iPhone 13 Pro Max как определённое устройство для запроса "iPhone 13 Pro"', () => {
    const pro = buildDevice({ id: 'iphone-13-pro', generation: 13, modifiers: ['pro'] });
    const proMax = buildDevice({
      id: 'iphone-13-pro-max',
      generation: 13,
      modifiers: ['pro', 'max'],
    });
    const index = buildMatchIndex([pro, proMax]);

    const result = matchQuery(buildSlots({ generation: 13, modifiers: ['pro'] }), index);

    expect(result.status).toBe('determined');
    expect(result.candidates.map((candidate) => candidate.device.id)).toEqual(['iphone-13-pro']);
  });
});

describe('ЗАПРЕЩЕНО: S23 не сопоставляется с S23 FE', () => {
  it('мера Джаро—Винклера сама по себе посчитала бы "s23" префиксом-совпадением с "s23 fe"', () => {
    const similarity = jaroWinklerSimilarity('s23', 's23 fe');
    expect(similarity).toBeGreaterThan(FUZZY_MATCH_THRESHOLD);
  });

  it('rejectCandidate отклоняет запрос с явным модификатором "fe" против устройства без модификаторов', () => {
    const slots = buildSlots({
      brand: 'samsung',
      family: 'galaxy-s',
      generation: 23,
      modifiers: ['fe'],
    });
    const device = buildDevice({
      brand: 'samsung',
      family: 'galaxy-s',
      generation: 23,
      modifiers: [],
    });

    const rejection = rejectCandidate(slots, device);

    expect(rejection?.code).toBe('REJECT_MODIFIER_SET_MISMATCH');
  });

  it('полный конвейер matchQuery не возвращает базовый S23 как определённое устройство для запроса "S23 FE"', () => {
    const base = buildDevice({
      id: 's23',
      brand: 'samsung',
      family: 'galaxy-s',
      generation: 23,
      modifiers: [],
    });
    const fe = buildDevice({
      id: 's23-fe',
      brand: 'samsung',
      family: 'galaxy-s',
      generation: 23,
      modifiers: ['fe'],
    });
    const index = buildMatchIndex([base, fe]);

    const result = matchQuery(
      buildSlots({ brand: 'samsung', family: 'galaxy-s', generation: 23, modifiers: ['fe'] }),
      index,
    );

    expect(result.status).toBe('determined');
    expect(result.candidates.map((candidate) => candidate.device.id)).toEqual(['s23-fe']);
  });
});

describe('ЗАПРЕЩЕНО: Redmi Note 12 не сопоставляется с Redmi Note 13', () => {
  it('нечёткая мера расстояния сама по себе посчитала бы "redmi-note 12" и "redmi-note 13" похожими', () => {
    const similarity = editSimilarity('redmi-note 12', 'redmi-note 13');
    expect(similarity).toBeGreaterThan(FUZZY_MATCH_THRESHOLD);
  });

  it('rejectCandidate отклоняет пару с кодом REJECT_GENERATION_MISMATCH', () => {
    const slots = buildSlots({ brand: 'xiaomi', family: 'redmi-note', generation: 12 });
    const device = buildDevice({ brand: 'xiaomi', family: 'redmi-note', generation: 13 });

    const rejection = rejectCandidate(slots, device);

    expect(rejection?.code).toBe('REJECT_GENERATION_MISMATCH');
  });

  it('полный конвейер matchQuery не возвращает Redmi Note 13 как определённое устройство для запроса "Redmi Note 12"', () => {
    const note12 = buildDevice({
      id: 'redmi-note-12',
      brand: 'xiaomi',
      family: 'redmi-note',
      generation: 12,
    });
    const note13 = buildDevice({
      id: 'redmi-note-13',
      brand: 'xiaomi',
      family: 'redmi-note',
      generation: 13,
    });
    const index = buildMatchIndex([note12, note13]);

    const result = matchQuery(
      buildSlots({ brand: 'xiaomi', family: 'redmi-note', generation: 12 }),
      index,
    );

    expect(result.status).toBe('determined');
    expect(result.candidates.map((candidate) => candidate.device.id)).toEqual(['redmi-note-12']);
  });
});

describe('ЗАПРЕЩЕНО: ограничение действует независимо от весов оценки (ADR-020)', () => {
  it('кандидат с несовпадающим поколением не попадает в результат ни при каком наборе весов, включая заведомо неудачные', () => {
    const iphone12 = buildDevice({ id: 'iphone-12', generation: 12, modifiers: [] });
    const iphone13 = buildDevice({ id: 'iphone-13', generation: 13, modifiers: [] });
    const index = buildMatchIndex([iphone12, iphone13]);
    const slots = buildSlots({ generation: 13, modifiers: [] });

    const adversarialWeightSets: readonly ScoringWeights[] = [
      // Весь вес — в схожесть семейства: family совпадает идеально ("iphone" у обоих кандидатов).
      // Если бы ограничение на поколение было составляющей ОЦЕНКИ, а не предикатом ОТБОРА,
      // именно такой набор весов замаскировал бы несовпадение поколения максимальной схожестью
      // текстовой части — ровно тот сценарий, который описывает ADR-020.
      {
        brandMatch: 0,
        generationMatch: 0,
        modifierSetMatch: 0,
        familySimilarity: 1,
        tokenCoverage: 0,
        popularity: 0,
      },
      // Экстремальный перекос в популярность.
      {
        brandMatch: 0,
        generationMatch: 0,
        modifierSetMatch: 0,
        familySimilarity: 0,
        tokenCoverage: 0,
        popularity: 1,
      },
      // Все веса нулевые.
      {
        brandMatch: 0,
        generationMatch: 0,
        modifierSetMatch: 0,
        familySimilarity: 0,
        tokenCoverage: 0,
        popularity: 0,
      },
      // Штатные веса по умолчанию для контраста.
      {
        brandMatch: 0.15,
        generationMatch: 0.15,
        modifierSetMatch: 0.1,
        familySimilarity: 0.4,
        tokenCoverage: 0.15,
        popularity: 0.05,
      },
    ];

    for (const weights of adversarialWeightSets) {
      const result = matchQuery(slots, index, { weights, constraints: { minBrandSimilarity: 0 } });

      const candidateIds = result.candidates.map((candidate) => candidate.device.id);
      const rejectedIds = result.rejectedCandidates.map((entry) => entry.device.id);

      expect(candidateIds).not.toContain('iphone-12');
      expect(rejectedIds).toContain('iphone-12');
    }
  });
});

import type { MatcherDevice, QuerySlots } from './types';
import {
  DEFAULT_SCORING_WEIGHTS,
  buildComparableQueryText,
  scoreCandidate,
  type ScoringWeights,
} from './scoring';

function buildDevice(overrides: Partial<MatcherDevice> = {}): MatcherDevice {
  return {
    id: 'apple-iphone-13-pro',
    brand: 'apple',
    family: 'iphone',
    generation: 13,
    modifiers: ['pro'],
    modelCodes: [],
    aliases: [],
    marketingName: 'iPhone 13 Pro',
    popularity: 50,
    ...overrides,
  };
}

// `Partial<QuerySlots>` не годится для override-объектов: под `exactOptionalPropertyTypes` явное
// присвоение `undefined` необязательному полю (`{ brand: undefined }`) требует, чтобы тип поля
// включал `undefined` буквально — `Partial` лишь делает ключ необязательным, тип значения не меняет.
// Расширяем явным `| undefined` только действительно необязательные поля `QuerySlots` —
// `modifiers`/`attributes`/`unparsed` обязательны и должны остаться такими в override-объекте.
type QuerySlotsOverrides = Omit<
  Partial<QuerySlots>,
  'brand' | 'family' | 'generation' | 'modelCode'
> & {
  readonly brand?: string | undefined;
  readonly family?: string | undefined;
  readonly generation?: number | undefined;
  readonly modelCode?: string | undefined;
};

function buildSlots(overrides: QuerySlotsOverrides = {}): QuerySlots {
  // Приведение типа допустимо в спек-файле (eslint.config.ts выключает
  // consistent-type-assertions для `**/*.spec.ts`): `overrides` — контролируемая тестовая
  // фикстура, а не внешние данные, к которым относится запрет ADR-016.
  return {
    brand: 'iphone',
    family: 'iphone',
    generation: 13,
    modifiers: ['pro'],
    attributes: {},
    unparsed: [],
    ...overrides,
  } as QuerySlots;
}

describe('buildComparableQueryText', () => {
  it('объединяет brand и family, не дублируя единственный словесный токен запроса', () => {
    expect(buildComparableQueryText(buildSlots({ brand: 'iphone', family: 'iphone' }))).toBe(
      'iphone',
    );
  });

  it('раскрывает кебаб-кейс family в отдельные слова и объединяет с brand', () => {
    expect(buildComparableQueryText(buildSlots({ brand: 'xiaomi', family: 'redmi-note' }))).toBe(
      'xiaomi redmi note',
    );
  });

  it('пустая строка, если ни brand, ни family не распознаны', () => {
    expect(buildComparableQueryText(buildSlots({ brand: undefined, family: undefined }))).toBe('');
  });
});

describe('scoreCandidate — разбивка по шести составляющим (docs/04 §4.6, ADR-010)', () => {
  it('возвращает разбивку по всем шести составляющим и итоговую оценку в [0, 1]', () => {
    const result = scoreCandidate(buildSlots(), buildDevice());

    expect(Object.keys(result.breakdown).sort()).toEqual(
      [
        'brandMatch',
        'generationMatch',
        'modifierSetMatch',
        'familySimilarity',
        'tokenCoverage',
        'popularity',
      ].sort(),
    );
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
    expect(result.device).toEqual(buildDevice());
  });

  it('точное совпадение по всем полям даёт максимальную оценку в семье составляющих', () => {
    const slots = buildSlots({
      brand: 'samsung',
      family: 'galaxy-s',
      generation: 23,
      modifiers: ['ultra'],
    });
    const device = buildDevice({
      brand: 'samsung',
      family: 'galaxy-s',
      generation: 23,
      modifiers: ['ultra'],
    });

    const result = scoreCandidate(slots, device);

    expect(result.breakdown.brandMatch).toBe(1);
    expect(result.breakdown.generationMatch).toBe(1);
    expect(result.breakdown.modifierSetMatch).toBe(1);
    expect(result.breakdown.familySimilarity).toBe(1);
    expect(result.breakdown.tokenCoverage).toBe(1);
  });

  describe('generationMatch и modifierSetMatch — ADR-020: не понижают до отклонения, но честно отражают несовпадение в разбивке', () => {
    it('generationMatch = 1, когда номер в запросе отсутствует (нет информации)', () => {
      const result = scoreCandidate(
        buildSlots({ generation: undefined }),
        buildDevice({ generation: 99 }),
      );
      expect(result.breakdown.generationMatch).toBe(1);
    });

    it('generationMatch = 0 при явном несовпадении, если функция вызвана в обход rejectCandidate', () => {
      const result = scoreCandidate(
        buildSlots({ generation: 13 }),
        buildDevice({ generation: 14 }),
      );
      expect(result.breakdown.generationMatch).toBe(0);
    });

    it('modifierSetMatch = 1, когда запрос не называет модификаторов вовсе', () => {
      const result = scoreCandidate(
        buildSlots({ modifiers: [] }),
        buildDevice({ modifiers: ['pro', 'max'] }),
      );
      expect(result.breakdown.modifierSetMatch).toBe(1);
    });

    it('modifierSetMatch = 0 при явном несовпадении множества модификаторов', () => {
      const result = scoreCandidate(
        buildSlots({ modifiers: ['pro'] }),
        buildDevice({ modifiers: ['pro', 'max'] }),
      );
      expect(result.breakdown.modifierSetMatch).toBe(0);
    });
  });

  it('tokenCoverage снижается неразобранным остатком запроса', () => {
    const fullyCovered = scoreCandidate(buildSlots({ unparsed: [] }), buildDevice());
    const withLeftover = scoreCandidate(buildSlots({ unparsed: ['999'] }), buildDevice());

    expect(withLeftover.breakdown.tokenCoverage).toBeLessThan(fullyCovered.breakdown.tokenCoverage);
  });

  it('tokenCoverage = 1 для ветки сервисного кода (весь ввод потреблён распознаванием кода)', () => {
    const slots = buildSlots({
      brand: undefined,
      family: undefined,
      generation: undefined,
      modifiers: [],
      modelCode: 'SM-S928B',
      unparsed: [],
    });
    const result = scoreCandidate(slots, buildDevice());
    expect(result.breakdown.tokenCoverage).toBe(1);
  });

  it('familySimilarity = 1 для ветки сервисного кода — device найден по точному коду, а не по тексту', () => {
    // ADR-019: в ветке modelCode brand/family в QuerySlots отсутствуют по построению, поэтому
    // buildComparableQueryText(slots) пуст. Устройство сюда попадает уже найденным по точному
    // индексу кодов (match.ts), поэтому нечёткое сравнение текста неприменимо и не должно занижать
    // оценку самого точного вида ввода (docs/04 §4.5) — регрессионный тест на баг, из-за которого
    // familySimilarity ошибочно возвращала 0 в этой ветке.
    const slots = buildSlots({
      brand: undefined,
      family: undefined,
      generation: undefined,
      modifiers: [],
      modelCode: 'SM-S928B',
      unparsed: [],
    });
    const result = scoreCandidate(slots, buildDevice());
    expect(result.breakdown.familySimilarity).toBe(1);
  });

  it('tokenCoverage = 0 для полностью пустого запроса (нет ни распознанного, ни неразобранного)', () => {
    const slots = buildSlots({
      brand: undefined,
      family: undefined,
      generation: undefined,
      modifiers: [],
      unparsed: [],
    });
    const result = scoreCandidate(slots, buildDevice());
    expect(result.breakdown.tokenCoverage).toBe(0);
  });

  it('popularity растёт с популярностью устройства, но не превышает 1', () => {
    const low = scoreCandidate(buildSlots(), buildDevice({ popularity: 1 }));
    const high = scoreCandidate(buildSlots(), buildDevice({ popularity: 1000 }));

    expect(high.breakdown.popularity).toBeGreaterThan(low.breakdown.popularity);
    expect(high.breakdown.popularity).toBeLessThan(1);
  });

  it('popularity = 0 для неположительной популярности', () => {
    const result = scoreCandidate(buildSlots(), buildDevice({ popularity: 0 }));
    expect(result.breakdown.popularity).toBe(0);
  });

  it('масштаб популярности настраивается параметром popularityScale', () => {
    const defaultScale = scoreCandidate(buildSlots(), buildDevice({ popularity: 10 }));
    const smallerScale = scoreCandidate(
      buildSlots(),
      buildDevice({ popularity: 10 }),
      DEFAULT_SCORING_WEIGHTS,
      {
        popularityScale: 1,
      },
    );

    expect(smallerScale.breakdown.popularity).toBeGreaterThan(defaultScale.breakdown.popularity);
  });

  it('веса приходят параметром: разные веса дают разную итоговую оценку для одного кандидата', () => {
    const zeroFamilyWeight: ScoringWeights = { ...DEFAULT_SCORING_WEIGHTS, familySimilarity: 0 };
    const withDefault = scoreCandidate(buildSlots({ family: 'iphonex' }), buildDevice());
    const withoutFamily = scoreCandidate(
      buildSlots({ family: 'iphonex' }),
      buildDevice(),
      zeroFamilyWeight,
    );

    expect(withDefault.score).not.toBe(withoutFamily.score);
  });

  it('нормирует по фактической сумме переданных весов, а не жёстко по 1', () => {
    const doubledWeights: ScoringWeights = {
      brandMatch: DEFAULT_SCORING_WEIGHTS.brandMatch * 2,
      generationMatch: DEFAULT_SCORING_WEIGHTS.generationMatch * 2,
      modifierSetMatch: DEFAULT_SCORING_WEIGHTS.modifierSetMatch * 2,
      familySimilarity: DEFAULT_SCORING_WEIGHTS.familySimilarity * 2,
      tokenCoverage: DEFAULT_SCORING_WEIGHTS.tokenCoverage * 2,
      popularity: DEFAULT_SCORING_WEIGHTS.popularity * 2,
    };
    const withDefault = scoreCandidate(buildSlots(), buildDevice());
    const withDoubled = scoreCandidate(buildSlots(), buildDevice(), doubledWeights);

    expect(withDoubled.score).toBeCloseTo(withDefault.score, 10);
  });

  it('нулевая сумма весов не приводит к делению на ноль (счёт 0)', () => {
    const zeroWeights: ScoringWeights = {
      brandMatch: 0,
      generationMatch: 0,
      modifierSetMatch: 0,
      familySimilarity: 0,
      tokenCoverage: 0,
      popularity: 0,
    };
    const result = scoreCandidate(buildSlots(), buildDevice(), zeroWeights);
    expect(result.score).toBe(0);
  });
});

import type { MatcherDevice, QuerySlots } from './types';
import { buildMatchIndex, matchQuery } from './match';

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
    popularity: 1,
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

describe('matchQuery — точный индекс (docs/04 §4.6, ступень 1)', () => {
  it('находит устройство по сервисному коду модели (MATCH_MODEL_CODE)', () => {
    const device = buildDevice({ modelCodes: ['SM-S928B'] });
    const index = buildMatchIndex([device]);
    const slots = buildSlots({
      brand: undefined,
      family: undefined,
      generation: undefined,
      modifiers: [],
      modelCode: 'SM-S928B',
    });

    const result = matchQuery(slots, index);

    expect(result.status).toBe('determined');
    expect(result.candidates[0]?.device.id).toBe(device.id);
    expect(result.reasons).toContain('MATCH_MODEL_CODE');
  });

  it('сервисный код без совпадения в справочнике — not_found, без обращения к нечёткому отбору', () => {
    const index = buildMatchIndex([buildDevice({ modelCodes: ['SM-S928B'] })]);
    const slots = buildSlots({
      brand: undefined,
      family: undefined,
      generation: undefined,
      modifiers: [],
      modelCode: 'CPH2451',
    });

    const result = matchQuery(slots, index);

    expect(result.status).toBe('not_found');
    expect(result.reasons).toEqual(['DECISION_NO_CANDIDATES']);
  });

  it('находит устройство по точному псевдониму через queryText (MATCH_EXACT_ALIAS)', () => {
    const device = buildDevice({ aliases: ['iphone 13 pro'] });
    const index = buildMatchIndex([device]);

    const result = matchQuery(buildSlots(), index, { queryText: 'iphone 13 pro' });

    expect(result.status).toBe('determined');
    expect(result.candidates[0]?.device.id).toBe(device.id);
    expect(result.reasons).toContain('MATCH_EXACT_ALIAS');
  });

  it('без queryText первая ступень пропускается — сразу используется триграммный отбор', () => {
    const device = buildDevice({ aliases: ['iphone 13 pro'] });
    const index = buildMatchIndex([device]);

    const result = matchQuery(buildSlots(), index);

    expect(result.reasons).toContain('MATCH_FUZZY_FAMILY');
    expect(result.reasons).not.toContain('MATCH_EXACT_ALIAS');
  });
});

describe('matchQuery — триграммный отбор + жёсткие ограничения (docs/04 §4.6, ступень 2)', () => {
  it('отклонённые ограничениями кандидаты не попадают в candidates, но видны в rejectedCandidates', () => {
    const proMax = buildDevice({ id: 'iphone-13-pro-max', modifiers: ['pro', 'max'] });
    const proOnly = buildDevice({ id: 'iphone-13-pro', modifiers: ['pro'] });
    const index = buildMatchIndex([proMax, proOnly]);

    const result = matchQuery(buildSlots({ modifiers: ['pro'] }), index);

    expect(result.candidates.map((candidate) => candidate.device.id)).not.toContain(
      'iphone-13-pro-max',
    );
    expect(result.rejectedCandidates.map((entry) => entry.device.id)).toContain(
      'iphone-13-pro-max',
    );
    expect(result.reasons).toContain('REJECT_MODIFIER_SET_MISMATCH');
  });

  it('нет ни одного кандидата с общими триграммами → not_found', () => {
    const index = buildMatchIndex([buildDevice({ brand: 'samsung', family: 'galaxy-s' })]);

    const result = matchQuery(buildSlots({ brand: 'zzxxqq', family: 'zzxxqq' }), index);

    expect(result.status).toBe('not_found');
  });

  it('полностью пустой слотовый разбор (без brand/family) не обращается к триграммному индексу и даёт not_found', () => {
    const index = buildMatchIndex([buildDevice()]);
    const emptySlots: QuerySlots = { modifiers: [], attributes: {}, unparsed: [] };

    const result = matchQuery(emptySlots, index);

    expect(result.status).toBe('not_found');
  });
});

describe('matchQuery — правило разрыва (docs/04 §4.7)', () => {
  it('"galaxy s23" при S23/S23+/S23 Ultra/S23 FE в справочнике даёт clarification_required, а не тихий выбор базовой модели', () => {
    const base = buildDevice({
      id: 's23',
      brand: 'samsung',
      family: 'galaxy-s',
      generation: 23,
      modifiers: [],
      popularity: 80,
    });
    const plus = buildDevice({
      id: 's23-plus',
      brand: 'samsung',
      family: 'galaxy-s',
      generation: 23,
      modifiers: ['plus'],
      popularity: 50,
    });
    const ultra = buildDevice({
      id: 's23-ultra',
      brand: 'samsung',
      family: 'galaxy-s',
      generation: 23,
      modifiers: ['ultra'],
      popularity: 90,
    });
    const fe = buildDevice({
      id: 's23-fe',
      brand: 'samsung',
      family: 'galaxy-s',
      generation: 23,
      modifiers: ['fe'],
      popularity: 30,
    });
    const index = buildMatchIndex([base, plus, ultra, fe]);

    const slots: QuerySlots = {
      brand: 'galaxy',
      family: 's',
      generation: 23,
      modifiers: [],
      attributes: {},
      unparsed: [],
    };

    const result = matchQuery(slots, index);

    expect(result.status).toBe('clarification_required');
    expect(result.rejectedCandidates).toEqual([]);
    expect(result.candidates.length).toBeGreaterThanOrEqual(2);
    const candidateIds = new Set(result.candidates.map((candidate) => candidate.device.id));
    expect(candidateIds.has('s23')).toBe(true);
  });

  it('уточнение через resolveEquivalenceKey не требуется, если все близкие кандидаты эквивалентны', () => {
    const base = buildDevice({
      id: 's23',
      brand: 'samsung',
      family: 'galaxy-s',
      generation: 23,
      modifiers: [],
      popularity: 80,
    });
    const plus = buildDevice({
      id: 's23-plus',
      brand: 'samsung',
      family: 'galaxy-s',
      generation: 23,
      modifiers: ['plus'],
      popularity: 50,
    });
    const index = buildMatchIndex([base, plus]);
    const slots: QuerySlots = {
      brand: 'galaxy',
      family: 's',
      generation: 23,
      modifiers: [],
      attributes: {},
      unparsed: [],
    };

    const result = matchQuery(slots, index, { resolveEquivalenceKey: () => 'esim-supported' });

    expect(result.status).toBe('determined');
    expect(result.reasons).toContain('DECISION_RESOLVED_BY_EQUIVALENCE');
  });
});

describe('matchQuery — однозначный запрос (docs/04 §4.7: determined)', () => {
  it('"iphone 13 pro" среди базовой/pro/pro max модели определяет ровно iPhone 13 Pro', () => {
    const base = buildDevice({ id: 'iphone-13', modifiers: [], popularity: 80 });
    const pro = buildDevice({ id: 'iphone-13-pro', modifiers: ['pro'], popularity: 60 });
    const proMax = buildDevice({
      id: 'iphone-13-pro-max',
      modifiers: ['pro', 'max'],
      popularity: 70,
    });
    const index = buildMatchIndex([base, pro, proMax]);

    const result = matchQuery(buildSlots({ modifiers: ['pro'] }), index);

    expect(result.status).toBe('determined');
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.device.id).toBe('iphone-13-pro');
  });
});

describe('buildMatchIndex', () => {
  it('строит индексы по пустому справочнику без ошибок', () => {
    const index = buildMatchIndex([]);
    expect(index.devicesById.size).toBe(0);
  });
});

import type { MatcherDevice, QuerySlots } from './types';
import { computeBrandSimilarity, rejectCandidate } from './constraints';

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
// присвоение `undefined` необязательному полю (`{ brand: undefined }`, что тестам нужно для
// сценария «бренд не распознан») требует, чтобы тип поля включал `undefined` буквально — `Partial`
// лишь делает ключ необязательным, тип значения не меняет. Расширяем явным `| undefined` только
// действительно необязательные поля `QuerySlots` — `modifiers`/`attributes`/`unparsed` обязательны
// и должны остаться такими в override-объекте.
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

describe('rejectCandidate — бренд (docs/04 §4.2: жёсткий фильтр отбора)', () => {
  it('пропускает кандидата, когда бренд в запросе не распознан вовсе', () => {
    const slots = buildSlots({ brand: undefined, family: undefined });
    expect(rejectCandidate(slots, buildDevice())).toBeNull();
  });

  it('пропускает единственный словесный токен запроса ("iphone"), похожий на family устройства, а не на его brand', () => {
    // ADR-019: для "iphone 15 pro" text-normalizer кладёт "iphone" и в brand, и в family —
    // сравнивать нужно с обоими полями устройства (device.brand === 'apple' здесь не похоже).
    const slots = buildSlots({ brand: 'iphone' });
    expect(rejectCandidate(slots, buildDevice())).toBeNull();
  });

  it('пропускает точное совпадение с device.brand', () => {
    const slots = buildSlots({
      brand: 'samsung',
      family: 'galaxy-s',
      generation: undefined,
      modifiers: [],
    });
    const device = buildDevice({
      brand: 'samsung',
      family: 'galaxy-s',
      generation: null,
      modifiers: [],
    });
    expect(rejectCandidate(slots, device)).toBeNull();
  });

  it('отклоняет явно другой бренд с кодом REJECT_BRAND_MISMATCH', () => {
    // samsung vs apple/iphone даёт схожесть ≈0.45 (ниже порога 0.5) — в отличие от xiaomi vs iphone
    // (≈0.556, выше порога): совпадающие подряд буквы "i" делают пару ложноположительной для
    // жаро-винклеровской меры, поэтому для проверки отклонения нужна пара с более низкой схожестью.
    const slots = buildSlots({
      brand: 'samsung',
      family: 'galaxy-s',
      generation: 12,
      modifiers: [],
    });
    const device = buildDevice({ brand: 'apple', family: 'iphone', generation: 12, modifiers: [] });

    const rejection = rejectCandidate(slots, device);

    expect(rejection).not.toBeNull();
    expect(rejection?.code).toBe('REJECT_BRAND_MISMATCH');
    expect(rejection?.deviceId).toBe(device.id);
  });

  it('порог можно настроить параметром minBrandSimilarity', () => {
    const slots = buildSlots({
      brand: 'samsung',
      family: 'galaxy-s',
      generation: 12,
      modifiers: [],
    });
    const device = buildDevice({ brand: 'apple', family: 'iphone', generation: 12, modifiers: [] });

    // Порог 0 пропускает вообще любой бренд — параметр действительно влияет на поведение.
    expect(rejectCandidate(slots, device, { minBrandSimilarity: 0 })).toBeNull();
  });
});

describe('computeBrandSimilarity', () => {
  it('undefined, когда бренд запроса не распознан', () => {
    expect(computeBrandSimilarity(buildSlots({ brand: undefined }), buildDevice())).toBeUndefined();
  });

  it('берёт максимум схожести с device.brand и device.family', () => {
    const similarity = computeBrandSimilarity(buildSlots({ brand: 'iphone' }), buildDevice());
    expect(similarity).toBeGreaterThan(0.9);
  });
});

describe('rejectCandidate — поколение (docs/04 §4.2: точное сравнение)', () => {
  it('не применяет ограничение, если номер поколения в запросе отсутствует', () => {
    const slots = buildSlots({ generation: undefined, modifiers: [] });
    const device = buildDevice({ generation: 99, modifiers: [] });
    expect(rejectCandidate(slots, device)).toBeNull();
  });

  it('пропускает точное совпадение номера поколения', () => {
    const slots = buildSlots({ generation: 13, modifiers: [] });
    const device = buildDevice({ generation: 13, modifiers: [] });
    expect(rejectCandidate(slots, device)).toBeNull();
  });

  it('отклоняет несовпадающее поколение с кодом REJECT_GENERATION_MISMATCH', () => {
    const slots = buildSlots({ generation: 13, modifiers: [] });
    const device = buildDevice({ generation: 14, modifiers: [] });

    const rejection = rejectCandidate(slots, device);

    expect(rejection?.code).toBe('REJECT_GENERATION_MISMATCH');
  });

  it('номер в запросе при generation: null у устройства — всегда отклонение', () => {
    const slots = buildSlots({ generation: 13, modifiers: [] });
    const device = buildDevice({ generation: null, modifiers: [] });

    const rejection = rejectCandidate(slots, device);

    expect(rejection?.code).toBe('REJECT_GENERATION_MISMATCH');
  });
});

describe('rejectCandidate — набор модификаторов (docs/04 §4.2: множество, лишний/отсутствующий равнозначны)', () => {
  it('не применяет ограничение, если запрос не называет ни одного модификатора', () => {
    // Намеренное исключение (см. комментарий в constraints.ts): иначе базовая модель — единственная
    // с пустым набором модификаторов — стала бы единственным выжившим кандидатом, и запрос вида
    // "galaxy s23" молча резолвился бы в неё вместо clarification_required (docs/04 §4.7).
    const slots = buildSlots({ modifiers: [] });
    const device = buildDevice({ modifiers: ['pro', 'max'] });
    expect(rejectCandidate(slots, device)).toBeNull();
  });

  it('пропускает точное совпадение набора модификаторов независимо от порядка', () => {
    const slots = buildSlots({ modifiers: ['max', 'pro'] });
    const device = buildDevice({ modifiers: ['pro', 'max'] });
    expect(rejectCandidate(slots, device)).toBeNull();
  });

  it('ОТКЛОНЯЕТ "pro" против "pro max" — лишний модификатор', () => {
    const slots = buildSlots({ modifiers: ['pro'] });
    const device = buildDevice({ modifiers: ['pro', 'max'] });

    const rejection = rejectCandidate(slots, device);

    expect(rejection?.code).toBe('REJECT_MODIFIER_SET_MISMATCH');
  });

  it('ОТКЛОНЯЕТ "pro max" против "pro" — отсутствующий модификатор', () => {
    const slots = buildSlots({ modifiers: ['pro', 'max'] });
    const device = buildDevice({ modifiers: ['pro'] });

    const rejection = rejectCandidate(slots, device);

    expect(rejection?.code).toBe('REJECT_MODIFIER_SET_MISMATCH');
  });

  it('запрос с явным модификатором ("fe") отклоняет устройство без него — S23 ≠ S23 FE', () => {
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
});

describe('rejectCandidate — порядок проверок и возврат null', () => {
  it('возвращает null, когда все три ограничения пройдены', () => {
    const slots = buildSlots();
    expect(rejectCandidate(slots, buildDevice())).toBeNull();
  });
});

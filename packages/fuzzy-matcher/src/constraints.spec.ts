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
      family: 'galaxy',
      generation: 12,
      modifiers: [],
    });
    const device = buildDevice({ brand: 'apple', family: 'iphone', generation: 12, modifiers: [] });

    // Порог 0 пропускает вообще любой бренд — параметр действительно влияет на поведение.
    // family без однобуквенного обозначения, иначе REJECT_LINE_DESIGNATOR_MISMATCH сработал бы
    // раньше, чем проверяемый порог бренда (galaxy-s → {s} против iphone → {}).
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

describe('rejectCandidate — однобуквенное обозначение линейки (docs/04 §4.2: точное сравнение)', () => {
  const s23Query = buildSlots({
    brand: 'samsung',
    family: 'galaxy-s',
    generation: 23,
    modifiers: [],
  });

  it('не применяет ограничение, если запрос не назвал однобуквенного обозначения', () => {
    const slots = buildSlots({
      brand: 'samsung',
      family: 'galaxy',
      generation: 23,
      modifiers: [],
    });
    const a23 = buildDevice({
      brand: 'samsung',
      family: 'galaxy',
      generation: 23,
      modifiers: ['a'],
    });
    expect(rejectCandidate(slots, a23)).toBeNull();
  });

  it('пропускает точное совпадение обозначения (galaxy-s ↔ Galaxy S23)', () => {
    const s23 = buildDevice({
      id: 'samsung-galaxy-s23',
      brand: 'samsung',
      family: 'galaxy-s',
      generation: 23,
      modifiers: [],
    });
    expect(rejectCandidate(s23Query, s23)).toBeNull();
  });

  it('ОТКЛОНЯЕТ galaxy s23 против Galaxy A23 — обозначение из modifiers устройства', () => {
    const a23 = buildDevice({
      id: 'samsung-galaxy-a23',
      brand: 'samsung',
      family: 'galaxy',
      generation: 23,
      modifiers: ['a'],
    });

    const rejection = rejectCandidate(s23Query, a23);

    expect(rejection).not.toBeNull();
    expect(rejection?.code).toBe('REJECT_LINE_DESIGNATOR_MISMATCH');
    expect(rejection?.deviceId).toBe('samsung-galaxy-a23');
  });

  it('ОТКЛОНЯЕТ galaxy s23 против Galaxy M23 — обозначение из последнего сегмента семейства', () => {
    const m23 = buildDevice({
      id: 'samsung-galaxy-m23',
      brand: 'samsung',
      family: 'galaxy-m',
      generation: 23,
      modifiers: [],
    });

    const rejection = rejectCandidate(s23Query, m23);

    expect(rejection?.code).toBe('REJECT_LINE_DESIGNATOR_MISMATCH');
  });

  it('запрос без бренда (family: "s", как у «галакси с23») тоже отклоняет A23', () => {
    const slots = buildSlots({
      brand: 'galaxy',
      family: 's',
      generation: 23,
      modifiers: [],
    });
    const a23 = buildDevice({
      id: 'samsung-galaxy-a23',
      brand: 'samsung',
      family: 'galaxy',
      generation: 23,
      modifiers: ['a'],
    });

    const rejection = rejectCandidate(slots, a23);

    expect(rejection?.code).toBe('REJECT_LINE_DESIGNATOR_MISMATCH');
  });

  it('собственный запрос Galaxy M01s (family galaxy-m-s → {m,s}) проходит', () => {
    const slots = buildSlots({
      brand: 'samsung',
      family: 'galaxy-m-s',
      generation: 1,
      modifiers: [],
    });
    const device = buildDevice({
      id: 'samsung-galaxy-m01s',
      brand: 'samsung',
      family: 'galaxy-m-s',
      generation: 1,
      modifiers: [],
    });
    expect(rejectCandidate(slots, device)).toBeNull();
  });

  it('собственный запрос Galaxy S10e (family galaxy-s-e → {s,e}) проходит', () => {
    const slots = buildSlots({
      brand: 'samsung',
      family: 'galaxy-s-e',
      generation: 10,
      modifiers: [],
    });
    const device = buildDevice({
      id: 'samsung-galaxy-s10e',
      brand: 'samsung',
      family: 'galaxy-s-e',
      generation: 10,
      modifiers: [],
    });
    expect(rejectCandidate(slots, device)).toBeNull();
  });

  it('собственный запрос Galaxy M01 Core (family galaxy-m-core → {m}) проходит', () => {
    const slots = buildSlots({
      brand: 'samsung',
      family: 'galaxy-m-core',
      generation: 1,
      modifiers: [],
    });
    const device = buildDevice({
      id: 'samsung-galaxy-m01-core',
      brand: 'samsung',
      family: 'galaxy-m-core',
      generation: 1,
      modifiers: [],
    });
    expect(rejectCandidate(slots, device)).toBeNull();
  });

  it('собственный запрос Galaxy M21 2021 Edition (family galaxy-m-edition → {m}) проходит', () => {
    const slots = buildSlots({
      brand: 'samsung',
      family: 'galaxy-m-edition',
      generation: 21,
      modifiers: [],
    });
    const device = buildDevice({
      id: 'samsung-galaxy-m21-2021-edition',
      brand: 'samsung',
      family: 'galaxy-m-edition',
      generation: 21,
      modifiers: [],
    });
    expect(rejectCandidate(slots, device)).toBeNull();
  });

  it('запрос galaxy-s ({s}) отклоняет galaxy-s-e ({s,e}) — множества не равны', () => {
    const slots = buildSlots({
      brand: 'samsung',
      family: 'galaxy-s',
      generation: 10,
      modifiers: [],
    });
    const s10e = buildDevice({
      id: 'samsung-galaxy-s10e',
      brand: 'samsung',
      family: 'galaxy-s-e',
      generation: 10,
      modifiers: [],
    });

    const rejection = rejectCandidate(slots, s10e);

    expect(rejection?.code).toBe('REJECT_LINE_DESIGNATOR_MISMATCH');
  });

  it('запрос без бренда (family: "m-s", как у «Galaxy M01s») совпадает с записью galaxy-m-s', () => {
    const slots = buildSlots({
      brand: 'galaxy',
      family: 'm-s',
      generation: 1,
      modifiers: [],
    });
    const device = buildDevice({
      id: 'samsung-galaxy-m01s',
      brand: 'samsung',
      family: 'galaxy-m-s',
      generation: 1,
      modifiers: [],
    });
    expect(rejectCandidate(slots, device)).toBeNull();
  });

  it('запрос без бренда (family: "s-e", как у «Galaxy S10e») совпадает с записью galaxy-s-e', () => {
    const slots = buildSlots({
      brand: 'galaxy',
      family: 's-e',
      generation: 10,
      modifiers: [],
    });
    const device = buildDevice({
      id: 'samsung-galaxy-s10e',
      brand: 'samsung',
      family: 'galaxy-s-e',
      generation: 10,
      modifiers: [],
    });
    expect(rejectCandidate(slots, device)).toBeNull();
  });

  it('первая буква многосегментного семейства — не обозначение («погода в москве» → v-moskve)', () => {
    const slots = buildSlots({
      brand: 'honor',
      family: 'v-moskve',
      generation: undefined,
      modifiers: [],
    });
    const device = buildDevice({
      id: 'honor-magic-5',
      brand: 'honor',
      family: 'magic',
      generation: null,
      modifiers: [],
    });
    expect(rejectCandidate(slots, device)).toBeNull();
  });

  it('запрос galaxy-m ({m}) не ломает собственные линейки galaxy-m-core и galaxy-m-edition', () => {
    const slots = buildSlots({
      brand: 'samsung',
      family: 'galaxy-m',
      generation: 1,
      modifiers: [],
    });
    const mCore = buildDevice({
      id: 'samsung-galaxy-m01-core',
      brand: 'samsung',
      family: 'galaxy-m-core',
      generation: 1,
      modifiers: [],
    });
    const mEdition = buildDevice({
      id: 'samsung-galaxy-m21-2021-edition',
      brand: 'samsung',
      family: 'galaxy-m-edition',
      generation: 21,
      modifiers: [],
    });

    expect(rejectCandidate(slots, mCore)).toBeNull();
    expect(rejectCandidate(buildSlots({ ...slots, generation: 21 }), mEdition)).toBeNull();
  });
});

describe('rejectCandidate — порядок проверок и возврат null', () => {
  it('возвращает null, когда все ограничения пройдены', () => {
    const slots = buildSlots();
    expect(rejectCandidate(slots, buildDevice())).toBeNull();
  });
});

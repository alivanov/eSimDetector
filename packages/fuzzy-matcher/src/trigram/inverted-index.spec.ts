import type { MatcherDevice } from '../types';
import { buildDeviceTrigramKey, buildTrigramIndex, findTrigramCandidates } from './inverted-index';

function buildDevice(overrides: Partial<MatcherDevice> = {}): MatcherDevice {
  return {
    id: 'apple-iphone-15-pro',
    brand: 'apple',
    family: 'iphone',
    generation: 15,
    modifiers: ['pro'],
    modelCodes: [],
    aliases: [],
    marketingName: 'iPhone 15 Pro',
    popularity: 1,
    ...overrides,
  };
}

describe('buildDeviceTrigramKey', () => {
  it('склеивает бренд и семейство в один текстовый ключ', () => {
    expect(buildDeviceTrigramKey(buildDevice({ brand: 'samsung', family: 'galaxy-s' }))).toBe(
      'samsung galaxy s',
    );
  });

  it(
    'ЖЁСТКОЕ ОГРАНИЧЕНИЕ (AGENTS.md, предметное правило 2; docs/04 §4.2, §4.6): ключ не ' +
      'содержит цифру поколения, даже если она случайно оказалась приклеена к тексту семейства ' +
      '(например, из-за ошибки данных выгрузки, ADR-013) — цифры вычёркиваются безусловно',
    () => {
      const device = buildDevice({ brand: 'apple', family: 'iphone12', generation: 12 });

      const key = buildDeviceTrigramKey(device);

      expect(key).not.toMatch(/\d/);
      expect(key).toBe('apple iphone');
    },
  );

  it(
    'ЖЁСТКОЕ ОГРАНИЧЕНИЕ: ключ не содержит модификаторы линейки устройства — они вычитаются ' +
      'по полю device.modifiers, даже если слово-модификатор попало в текст family',
    () => {
      const device = buildDevice({
        brand: 'apple',
        family: 'iphone pro max',
        modifiers: ['pro', 'max'],
      });

      const key = buildDeviceTrigramKey(device);

      expect(key).toBe('apple iphone');
      expect(key).not.toMatch(/\bpro\b/);
      expect(key).not.toMatch(/\bmax\b/);
    },
  );

  it('нормализует регистр и схлопывает произвольные разделители между словами', () => {
    const device = buildDevice({
      brand: 'Samsung',
      family: 'Galaxy_S--Ultra',
      modifiers: ['ultra'],
    });

    expect(buildDeviceTrigramKey(device)).toBe('samsung galaxy s');
  });

  it('устройство без модификаторов и без цифр даёт ключ без изменений, кроме регистра', () => {
    const device = buildDevice({ brand: 'google', family: 'pixel', generation: 8, modifiers: [] });

    expect(buildDeviceTrigramKey(device)).toBe('google pixel');
  });
});

/**
 * Набор из нескольких десятков устройств разных брендов и семейств — проверяет, что триграммный
 * индекс отбирает разумное множество кандидатов даже при опечатках, а не полагается на точное
 * совпадение (это первая ступень отбора, ADR-005 — кандидатов ещё предстоит оценить агенту 2.4).
 */
const CATALOG: readonly MatcherDevice[] = [
  { brand: 'apple', family: 'iphone', generation: 15, modifiers: ['pro', 'max'] },
  { brand: 'apple', family: 'iphone', generation: 15, modifiers: ['pro'] },
  { brand: 'apple', family: 'iphone', generation: 14, modifiers: [] },
  { brand: 'apple', family: 'iphone', generation: 13, modifiers: ['mini'] },
  { brand: 'samsung', family: 'galaxy-s', generation: 24, modifiers: ['ultra'] },
  { brand: 'samsung', family: 'galaxy-s', generation: 23, modifiers: ['plus'] },
  { brand: 'samsung', family: 'galaxy-a', generation: 55, modifiers: [] },
  { brand: 'samsung', family: 'galaxy-z-flip', generation: 5, modifiers: [] },
  { brand: 'samsung', family: 'galaxy-z-fold', generation: 5, modifiers: [] },
  { brand: 'samsung', family: 'galaxy-note', generation: 20, modifiers: ['ultra'] },
  { brand: 'xiaomi', family: 'redmi-note', generation: 12, modifiers: ['pro'] },
  { brand: 'xiaomi', family: 'redmi-note', generation: 13, modifiers: [] },
  { brand: 'xiaomi', family: 'redmi', generation: 9, modifiers: ['a'] },
  { brand: 'xiaomi', family: 'poco', generation: 5, modifiers: ['pro'] },
  { brand: 'xiaomi', family: 'mi', generation: 11, modifiers: ['lite'] },
  { brand: 'honor', family: 'honor', generation: 90, modifiers: [] },
  { brand: 'honor', family: 'magic', generation: 6, modifiers: [] },
  { brand: 'huawei', family: 'p', generation: 60, modifiers: ['pro'] },
  { brand: 'huawei', family: 'mate', generation: 60, modifiers: [] },
  { brand: 'huawei', family: 'nova', generation: 11, modifiers: [] },
  { brand: 'google', family: 'pixel', generation: 8, modifiers: ['pro'] },
  { brand: 'google', family: 'pixel', generation: 7, modifiers: ['a'] },
  { brand: 'realme', family: 'realme', generation: 11, modifiers: [] },
  { brand: 'realme', family: 'narzo', generation: 60, modifiers: [] },
  { brand: 'oppo', family: 'reno', generation: 11, modifiers: [] },
  { brand: 'oppo', family: 'find', generation: 7, modifiers: [] },
  { brand: 'vivo', family: 'y', generation: 36, modifiers: [] },
  { brand: 'vivo', family: 'x', generation: 100, modifiers: [] },
  { brand: 'oneplus', family: 'oneplus', generation: 12, modifiers: [] },
  { brand: 'oneplus', family: 'nord', generation: 3, modifiers: [] },
  { brand: 'nokia', family: 'nokia', generation: 8, modifiers: [] },
  { brand: 'sony', family: 'xperia', generation: 5, modifiers: [] },
  { brand: 'tecno', family: 'camon', generation: 20, modifiers: [] },
  { brand: 'tecno', family: 'spark', generation: 10, modifiers: [] },
  { brand: 'infinix', family: 'hot', generation: 40, modifiers: [] },
  { brand: 'infinix', family: 'note', generation: 30, modifiers: [] },
  { brand: 'zte', family: 'blade', generation: 30, modifiers: [] },
  { brand: 'meizu', family: 'meizu', generation: 20, modifiers: ['pro'] },
  { brand: 'lenovo', family: 'legion', generation: 9, modifiers: [] },
  { brand: 'asus', family: 'zenfone', generation: 11, modifiers: [] },
  { brand: 'motorola', family: 'moto-g', generation: 84, modifiers: [] },
].map((entry, index): MatcherDevice => ({
  id: `${entry.brand}-${entry.family}-${String(entry.generation)}-${String(index)}`,
  brand: entry.brand,
  family: entry.family,
  generation: entry.generation,
  modifiers: entry.modifiers,
  modelCodes: [],
  aliases: [],
  marketingName: `${entry.brand} ${entry.family} ${String(entry.generation)}`,
  popularity: 1,
}));

describe('buildTrigramIndex / findTrigramCandidates на каталоге из нескольких десятков устройств', () => {
  it('каталог фикстуры действительно содержит несколько десятков устройств', () => {
    expect(CATALOG.length).toBeGreaterThanOrEqual(30);
  });

  it('опечатка в названии семейства всё равно находит верного кандидата первой ступенью', () => {
    const index = buildTrigramIndex(CATALOG);

    const candidates = findTrigramCandidates(index, 'iphon');
    const candidateDevices = candidates.map((id) => CATALOG.find((device) => device.id === id));

    expect(candidates.length).toBeGreaterThan(0);
    expect(candidateDevices.some((device) => device?.family === 'iphone')).toBe(true);
  });

  it('раскладка "xiomi redmi not" (опечатки в бренде и семействе) находит redmi-note', () => {
    const index = buildTrigramIndex(CATALOG);

    const candidates = findTrigramCandidates(index, 'xiomi redmi not');
    const candidateDevices = candidates.map((id) => CATALOG.find((device) => device.id === id));

    expect(candidateDevices.some((device) => device?.family === 'redmi-note')).toBe(true);
  });

  it('запрос без единой общей триграммы с каталогом не даёт кандидатов', () => {
    const index = buildTrigramIndex(CATALOG);

    // 'zzzzzzzzz' не годится для этой проверки: его краевая триграмма '  z' совпадает с
    // краевой триграммой ключа 'zte blade' (оба начинаются на 'z') — фактический прогон
    // теста это показал. 'qqqqqqqqq' не пересекается по триграммам ни с одним устройством
    // каталога (ни один бренд/семейство не начинается и не заканчивается на 'q').
    expect(findTrigramCandidates(index, 'qqqqqqqqq')).toEqual([]);
  });

  it('minSharedTrigrams отсекает кандидатов со слабым совпадением', () => {
    const index = buildTrigramIndex(CATALOG);

    const loose = findTrigramCandidates(index, 'iphon');
    const strict = findTrigramCandidates(index, 'iphon', { minSharedTrigrams: 100 });

    expect(loose.length).toBeGreaterThan(0);
    expect(strict).toEqual([]);
  });

  it('результат детерминирован: одинаковый запрос даёт одинаковый порядок кандидатов', () => {
    const index = buildTrigramIndex(CATALOG);

    expect(findTrigramCandidates(index, 'galaxy')).toEqual(findTrigramCandidates(index, 'galaxy'));
  });

  it('пустой каталог даёт пустой индекс и пустой список кандидатов', () => {
    const index = buildTrigramIndex([]);

    expect(findTrigramCandidates(index, 'iphone')).toEqual([]);
    expect(index.deviceTrigramKeys.size).toBe(0);
  });
});

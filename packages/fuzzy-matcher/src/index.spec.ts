import type { MatcherDevice, QuerySlots } from './index';
import {
  damerauLevenshteinDistance,
  editSimilarity,
  jaroSimilarity,
  jaroWinklerSimilarity,
  extractTrigrams,
  trigramSimilarity,
  buildDeviceTrigramKey,
  buildTrigramIndex,
  findTrigramCandidates,
  buildAliasIndex,
  lookupAlias,
  lookupModelCode,
} from './index';

function buildDevice(overrides: Partial<MatcherDevice> = {}): MatcherDevice {
  return {
    id: 'apple-iphone-15-pro',
    brand: 'apple',
    family: 'iphone',
    generation: 15,
    modifiers: ['pro'],
    modelCodes: ['SM-TEST'],
    aliases: ['iphone 15 pro'],
    marketingName: 'iPhone 15 Pro',
    popularity: 1,
    ...overrides,
  };
}

describe('index — публичная поверхность пакета fuzzy-matcher', () => {
  it('экспортирует меры расстояния и схожести', () => {
    expect(damerauLevenshteinDistance('a', 'a')).toBe(0);
    expect(editSimilarity('a', 'a')).toBe(1);
    expect(jaroSimilarity('a', 'a')).toBe(1);
    expect(jaroWinklerSimilarity('a', 'a')).toBe(1);
  });

  it('экспортирует триграммы и триграммный индекс', () => {
    expect(extractTrigrams('a').length).toBeGreaterThan(0);
    expect(trigramSimilarity('a', 'a')).toBe(1);

    const device = buildDevice();
    expect(buildDeviceTrigramKey(device)).toBe('apple iphone');

    const trigramIndex = buildTrigramIndex([device]);
    expect(findTrigramCandidates(trigramIndex, 'iphone')).toEqual([device.id]);
  });

  it('экспортирует точный индекс псевдонимов и сервисных кодов', () => {
    const device = buildDevice();
    const aliasIndex = buildAliasIndex([device]);

    expect(lookupAlias(aliasIndex, 'iphone 15 pro')).toBe(device);
    expect(lookupModelCode(aliasIndex, 'sm-test')).toBe(device);
  });

  it('реэкспортирует QuerySlots из text-normalizer, не дублируя объявление', () => {
    const slots: QuerySlots = {
      modifiers: [],
      attributes: {},
      unparsed: [],
    };

    expect(slots.modifiers).toEqual([]);
  });
});

import { parseSubbrands } from '../domain/subbrands';
import type { DeviceCandidate } from '../domain/types';
import { loadRealDictionary } from '../testing/dictionary-fixture';
import { normalizeSubbrandCandidates } from './subbrand-merge';

const DICTIONARY = loadRealDictionary();
const SUBBRANDS = parseSubbrands({ poco: 'xiaomi', redmi: 'xiaomi' }).subbrands;
const NOW = new Date('2026-08-18T00:00:00Z');

function candidate(overrides: Partial<DeviceCandidate> & { readonly id: string }): DeviceCandidate {
  return {
    brand: 'poco',
    brandTitle: 'POCO',
    marketingName: 'F3',
    family: 'f',
    generation: 3,
    modifiers: [],
    modelCodes: [],
    platform: 'android',
    deviceType: 'phone',
    releaseYear: 2021,
    esimSupport: 'no',
    esimConditions: [],
    provenance: {
      source: 'llm:model-a',
      batchId: '06b-redmi-poco',
      importedAt: NOW,
      lineNumber: 2,
    },
    ...overrides,
  };
}

describe('normalizeSubbrandCandidates', () => {
  it('без карты подбрендов не трогает кандидатов', () => {
    const candidates = [candidate({ id: 'poco-poco-f3', marketingName: 'POCO F3' })];
    const result = normalizeSubbrandCandidates(candidates, new Map(), DICTIONARY);
    expect(result.candidates).toEqual(candidates);
    expect(result.notices).toEqual([]);
  });

  it('сливает "POCO F3"/"F3" при совпадении сервисного кода (одинаковый бренд, разное написание)', () => {
    const withPrefix = candidate({
      id: 'poco-poco-f3',
      marketingName: 'POCO F3',
      modelCodes: ['M2012K11AG'],
      provenance: { source: 'llm:model-a', batchId: '06b', importedAt: NOW, lineNumber: 17 },
    });
    const bare = candidate({
      id: 'poco-f3',
      marketingName: 'F3',
      modelCodes: ['M2012K11AG'],
      provenance: { source: 'llm:model-b', batchId: '06b', importedAt: NOW, lineNumber: 25 },
    });

    const result = normalizeSubbrandCandidates([withPrefix, bare], SUBBRANDS, DICTIONARY);

    const ids = new Set(result.candidates.map((c) => c.id));
    expect(ids).toEqual(new Set(['poco-f3']));
    for (const candidateResult of result.candidates) {
      expect(candidateResult.brand).toBe('poco');
      expect(candidateResult.brandTitle).toBe('POCO');
      expect(candidateResult.marketingName).toBe('F3');
    }
    expect(result.notices).toEqual([
      expect.objectContaining({ code: 'SUBBRAND_ALIAS_MERGED', deviceId: 'poco-f3' }),
    ]);
  });

  it('сливает Xiaomi+"Redmi 9" и Redmi+"Redmi 9" при совпадении сервисного кода', () => {
    const xiaomiRow = candidate({
      id: 'xiaomi-redmi-9',
      brand: 'xiaomi',
      brandTitle: 'Xiaomi',
      marketingName: 'Redmi 9',
      family: 'redmi',
      generation: 9,
      modelCodes: ['M2004J19G'],
      provenance: { source: 'llm:model-a', batchId: '06b', importedAt: NOW, lineNumber: 2 },
    });
    const redmiRow = candidate({
      id: 'redmi-redmi-9',
      brand: 'redmi',
      brandTitle: 'Redmi',
      marketingName: 'Redmi 9',
      family: 'redmi',
      generation: 9,
      modelCodes: ['M2004J19G'],
      provenance: { source: 'llm:model-b', batchId: '06b', importedAt: NOW, lineNumber: 2 },
    });

    const result = normalizeSubbrandCandidates([xiaomiRow, redmiRow], SUBBRANDS, DICTIONARY);

    const ids = new Set(result.candidates.map((c) => c.id));
    expect(ids).toEqual(new Set(['redmi-9']));
    for (const candidateResult of result.candidates) {
      expect(candidateResult.brand).toBe('redmi');
      expect(candidateResult.brandTitle).toBe('Redmi');
      expect(candidateResult.marketingName).toBe('9');
      expect(candidateResult.generation).toBe(9);
    }
  });

  it('НЕ трогает "Redmi Note 8" (brand=xiaomi) — за подбрендом следует отдельное семейство, а не голый номер модели', () => {
    const noteRow = candidate({
      id: 'xiaomi-redmi-note-8',
      brand: 'xiaomi',
      brandTitle: 'Xiaomi',
      marketingName: 'Redmi Note 8',
      family: 'redmi-note',
      generation: 8,
      modelCodes: ['M1908C3JGG'],
    });
    // Гипотетическая запись, которая случайно делит код с "Redmi Note 8" — например, ошибка
    // источника — не должна слиться только из-за совпадения подбренда "redmi": семантика
    // остатка ("9", отдельное устройство) отличается от "Note 8" целиком.
    const bareRow = candidate({
      id: 'redmi-9',
      brand: 'redmi',
      brandTitle: 'Redmi',
      marketingName: '9',
      family: 'redmi',
      generation: 9,
      modelCodes: ['M1908C3JGG'],
    });

    const result = normalizeSubbrandCandidates([noteRow, bareRow], SUBBRANDS, DICTIONARY);

    const ids = new Set(result.candidates.map((c) => c.id));
    expect(ids).toEqual(new Set(['xiaomi-redmi-note-8', 'redmi-9']));
    expect(result.notices).toEqual([]);
  });

  it('без общего сервисного кода не сливает даже при совпадающем остатке названия (нет доказательства)', () => {
    const withPrefix = candidate({
      id: 'poco-poco-f3',
      marketingName: 'POCO F3',
      modelCodes: [],
    });
    const bare = candidate({ id: 'poco-f3', marketingName: 'F3', modelCodes: [] });

    const result = normalizeSubbrandCandidates([withPrefix, bare], SUBBRANDS, DICTIONARY);

    const ids = new Set(result.candidates.map((c) => c.id));
    expect(ids).toEqual(new Set(['poco-poco-f3', 'poco-f3']));
    expect(result.notices).toEqual([]);
  });

  it('разные остатки при общем коде (вероятная ошибка данных источника) не сливаются', () => {
    const pocoC40 = candidate({
      id: 'poco-c40',
      marketingName: 'C40',
      modelCodes: ['220333QNY'],
    });
    const redmi10c = candidate({
      id: 'xiaomi-redmi-10c',
      brand: 'xiaomi',
      brandTitle: 'Xiaomi',
      marketingName: 'Redmi 10C',
      family: 'redmi-c',
      modelCodes: ['220333QNY'],
    });

    const result = normalizeSubbrandCandidates([pocoC40, redmi10c], SUBBRANDS, DICTIONARY);

    const ids = new Set(result.candidates.map((c) => c.id));
    expect(ids).toEqual(new Set(['poco-c40', 'xiaomi-redmi-10c']));
  });

  it('идемпотентно на уже нормализованных кандидатах (повторный прогон не меняет id)', () => {
    const already = candidate({
      id: 'poco-f3',
      marketingName: 'F3',
      modelCodes: ['M2012K11AG'],
    });
    const other = candidate({
      id: 'poco-f3',
      marketingName: 'F3',
      modelCodes: ['M2012K11AG'],
      provenance: { source: 'llm:model-b', batchId: '06b', importedAt: NOW, lineNumber: 3 },
    });

    const result = normalizeSubbrandCandidates([already, other], SUBBRANDS, DICTIONARY);
    expect(result.notices).toEqual([]);
    expect(result.candidates.map((c) => c.id)).toEqual(['poco-f3', 'poco-f3']);
  });
});

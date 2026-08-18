import type { DeviceCandidate } from '../domain/types';
import { deserializeCandidates, serializeCandidates } from './candidate-cache';

const SAMPLE: DeviceCandidate = {
  id: 'samsung-galaxy-s24-ultra',
  brand: 'samsung',
  brandTitle: 'Samsung',
  marketingName: 'Galaxy S24 Ultra',
  family: 'galaxy-s',
  generation: 24,
  modifiers: ['ultra'],
  modelCodes: ['SM-S928B'],
  platform: 'android',
  deviceType: 'phone',
  releaseYear: 2024,
  esimSupport: 'conditional',
  esimConditions: [{ scope: 'region', value: 'CN', support: 'not_supported', note: 'region:CN=no' }],
  dualSim: 'physical+esim',
  maxEsimProfiles: 2,
  ruMarket: 'official',
  sourceUrl: 'https://www.samsung.com',
  confidenceSelfReported: 'high',
  notes: 'заметка',
  provenance: {
    source: 'llm:model-a',
    batchId: '02-samsung-galaxy-s',
    importedAt: new Date('2026-08-18T00:00:00.000Z'),
    lineNumber: 5,
  },
};

describe('serializeCandidates/deserializeCandidates', () => {
  it('переживает сериализацию через JSON без потерь', () => {
    const roundTripped = JSON.parse(JSON.stringify(serializeCandidates([SAMPLE])));
    const [result] = deserializeCandidates(roundTripped);
    expect(result).toEqual(SAMPLE);
  });

  it('отбрасывает элементы, не проходящие проверку формы', () => {
    expect(deserializeCandidates([{ not: 'a candidate' }])).toEqual([]);
    expect(deserializeCandidates('не массив')).toEqual([]);
  });

  it('отбрасывает элемент с некорректной датой в provenance.importedAt', () => {
    const broken = JSON.parse(JSON.stringify(serializeCandidates([SAMPLE])));
    broken[0].provenance.importedAt = 'не дата';
    expect(deserializeCandidates(broken)).toEqual([]);
  });
});

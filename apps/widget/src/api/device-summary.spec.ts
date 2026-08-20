import {
  parseCandidateSummaries,
  parseCandidateSummary,
  parseDeviceSummary,
  parseMatchSummaries,
  parseMatchSummary,
} from './device-summary';

const validDevice = {
  id: 'samsung-galaxy-s24-ultra',
  brand: 'Samsung',
  name: 'Galaxy S24 Ultra',
  modelCode: 'SM-S928B',
  esim: { support: 'supported', dualSim: 'physical+esim', maxProfiles: 2 },
};

describe('parseDeviceSummary', () => {
  it('null -> undefined (device: null в ответе — статус группы/поиска)', () => {
    expect(parseDeviceSummary(null)).toBeUndefined();
  });

  it('undefined -> undefined', () => {
    expect(parseDeviceSummary(undefined)).toBeUndefined();
  });

  it('разбирает полную запись, включая необязательный modelCode', () => {
    expect(parseDeviceSummary(validDevice)).toEqual(validDevice);
  });

  it('разбирает запись без modelCode', () => {
    const { modelCode: _modelCode, ...withoutModelCode } = validDevice;
    expect(parseDeviceSummary(withoutModelCode)).toEqual(withoutModelCode);
  });

  it('maxProfiles: null валиден', () => {
    const device = { ...validDevice, esim: { ...validDevice.esim, maxProfiles: null } };
    expect(parseDeviceSummary(device)?.esim.maxProfiles).toBeNull();
  });

  it('неверная форма esim -> undefined', () => {
    expect(parseDeviceSummary({ ...validDevice, esim: { support: 'unknown' } })).toBeUndefined();
    expect(parseDeviceSummary({ ...validDevice, esim: 'x' })).toBeUndefined();
    expect(
      parseDeviceSummary({ ...validDevice, esim: { ...validDevice.esim, maxProfiles: 'x' } }),
    ).toBeUndefined();
  });

  it('отсутствие обязательных полей -> undefined', () => {
    expect(parseDeviceSummary({ ...validDevice, id: 1 })).toBeUndefined();
    expect(parseDeviceSummary('x')).toBeUndefined();
  });
});

describe('parseCandidateSummary/parseCandidateSummaries', () => {
  it('разбирает кандидата с esimSupport и без', () => {
    expect(parseCandidateSummary({ id: 'a', name: 'A', esimSupport: 'supported' })).toEqual({
      id: 'a',
      name: 'A',
      esimSupport: 'supported',
    });
    expect(parseCandidateSummary({ id: 'a', name: 'A' })).toEqual({ id: 'a', name: 'A' });
  });

  it('неверная форма -> undefined', () => {
    expect(parseCandidateSummary({ id: 'a' })).toBeUndefined();
    expect(parseCandidateSummary({ id: 'a', name: 'A', esimSupport: 'x' })).toBeUndefined();
  });

  it('parseCandidateSummaries: пустой массив и массив кандидатов', () => {
    expect(parseCandidateSummaries([])).toEqual([]);
    expect(parseCandidateSummaries([{ id: 'a', name: 'A' }])).toEqual([{ id: 'a', name: 'A' }]);
  });

  it('parseCandidateSummaries: не массив либо элемент неверной формы -> undefined', () => {
    expect(parseCandidateSummaries('x')).toBeUndefined();
    expect(parseCandidateSummaries([{ id: 'a' }])).toBeUndefined();
  });
});

describe('parseMatchSummary/parseMatchSummaries', () => {
  it('разбирает совпадение с score', () => {
    expect(parseMatchSummary({ id: 'a', name: 'A', score: 0.9 })).toEqual({
      id: 'a',
      name: 'A',
      score: 0.9,
    });
  });

  it('без score -> undefined', () => {
    expect(parseMatchSummary({ id: 'a', name: 'A' })).toBeUndefined();
    expect(parseMatchSummary({ id: 'a', name: 'A', score: 'x' })).toBeUndefined();
  });

  it('parseMatchSummaries: массив и невалидный вход', () => {
    expect(parseMatchSummaries([{ id: 'a', name: 'A', score: 1 }])).toEqual([
      { id: 'a', name: 'A', score: 1 },
    ]);
    expect(parseMatchSummaries('x')).toBeUndefined();
    expect(parseMatchSummaries([{ id: 'a', name: 'A' }])).toBeUndefined();
  });
});

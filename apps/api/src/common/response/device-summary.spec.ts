import { buildSampleDevice } from '@esim-detector/contracts';

import { toCandidateSummary, toDeviceSummary, toMatchSummary } from './device-summary';

describe('device-summary', () => {
  it('toDeviceSummary проецирует запись справочника в форму ответа /detect', () => {
    const device = buildSampleDevice();
    const summary = toDeviceSummary(device);

    expect(summary).toEqual({
      id: 'samsung-galaxy-s24-ultra',
      brand: 'Samsung',
      name: 'Samsung Galaxy S24 Ultra',
      modelCode: 'SM-S928B',
      esim: { support: 'supported', dualSim: 'physical+esim', maxProfiles: 2 },
    });
  });

  it('toDeviceSummary опускает modelCode, если у устройства нет сервисных кодов', () => {
    const device = buildSampleDevice({ modelCodes: [] });
    const summary = toDeviceSummary(device);

    expect(summary.modelCode).toBeUndefined();
    expect(Object.hasOwn(summary, 'modelCode')).toBe(false);
  });

  it('toCandidateSummary возвращает id/name/esimSupport', () => {
    const device = buildSampleDevice({ _id: 'apple-iphone-x', displayName: 'iPhone X' });
    expect(toCandidateSummary(device)).toEqual({
      id: 'apple-iphone-x',
      name: 'iPhone X',
      esimSupport: 'supported',
    });
  });

  it('toMatchSummary добавляет score к CandidateSummary', () => {
    const device = buildSampleDevice();
    expect(toMatchSummary(device, 0.87)).toEqual({
      id: 'samsung-galaxy-s24-ultra',
      name: 'Samsung Galaxy S24 Ultra',
      esimSupport: 'supported',
      score: 0.87,
    });
  });
});

import { buildSampleDevice } from '@esim-detector/contracts';
import { validateCatalogInvariants } from '@esim-detector/contracts';

import { rebuildScreenSignatures } from './rebuild-signatures';

const NOW = new Date('2026-08-18T00:00:00Z');
const SIGNATURE = { cssWidth: 390, cssHeight: 844, dpr: 3, zoomed: false };

function iosDevice(overrides: Parameters<typeof buildSampleDevice>[0] = {}) {
  return buildSampleDevice({
    platform: 'ios',
    screenSignatures: [SIGNATURE],
    os: { minVersion: '16.0', maxVersion: '18.0' },
    ...overrides,
  });
}

describe('rebuildScreenSignatures', () => {
  it('игнорирует устройства не на iOS и не активные', () => {
    expect(rebuildScreenSignatures([buildSampleDevice({ platform: 'android' })], NOW)).toEqual([]);
    expect(rebuildScreenSignatures([iosDevice({ status: 'deprecated' })], NOW)).toEqual([]);
  });

  it('строит запись с единым esimConsensus, когда статус кандидатов совпадает', () => {
    const devices = [
      iosDevice({
        _id: 'apple-iphone-13',
        esim: { ...buildSampleDevice().esim, support: 'supported' },
      }),
      iosDevice({
        _id: 'apple-iphone-13-mini',
        esim: { ...buildSampleDevice().esim, support: 'supported' },
      }),
    ];
    const [record] = rebuildScreenSignatures(devices, NOW);
    expect(record).toEqual(
      expect.objectContaining({
        signature: '390x844@3',
        zoomed: false,
        candidates: ['apple-iphone-13', 'apple-iphone-13-mini'],
        esimConsensus: 'supported',
      }),
    );
  });

  it('даёт "mixed" при расхождении статусов кандидатов сигнатуры', () => {
    const devices = [
      iosDevice({
        _id: 'apple-iphone-13',
        esim: { ...buildSampleDevice().esim, support: 'supported' },
      }),
      iosDevice({
        _id: 'apple-iphone-x',
        esim: { ...buildSampleDevice().esim, support: 'not_supported' },
      }),
    ];
    const [record] = rebuildScreenSignatures(devices, NOW);
    expect(record?.esimConsensus).toBe('mixed');
  });

  it('результат проходит инвариант §5.8 п.7 без нарушений', () => {
    const devices = [
      iosDevice({
        _id: 'apple-iphone-13',
        modelCodes: [],
        esim: { ...buildSampleDevice().esim, support: 'supported' },
      }),
      iosDevice({
        _id: 'apple-iphone-13-mini',
        modelCodes: [],
        esim: { ...buildSampleDevice().esim, support: 'supported' },
      }),
    ];
    const records = rebuildScreenSignatures(devices, NOW);
    expect(validateCatalogInvariants(devices, records).valid).toBe(true);
  });

  it('разделяет обычную и "увеличенную" сигнатуру одного размера экрана', () => {
    const devices = [
      iosDevice({ _id: 'a' }),
      iosDevice({ _id: 'b', screenSignatures: [{ ...SIGNATURE, zoomed: true }] }),
    ];
    const records = rebuildScreenSignatures(devices, NOW);
    expect(records).toHaveLength(2);
  });
});

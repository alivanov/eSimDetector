import {
  buildSampleDevice,
  type Device,
  type ScreenSignatureRecord,
} from '@esim-detector/contracts';

import { selectIosCandidates } from './select-ios-candidates';

function iosDevice(overrides: Partial<Device> = {}): Device {
  return buildSampleDevice({
    platform: 'ios',
    brand: 'apple',
    brandTitle: 'Apple',
    screenSignatures: [],
    modelCodes: [],
    aliases: [],
    ...overrides,
  });
}

const iphoneX = iosDevice({
  _id: 'apple-iphone-x',
  marketingName: 'iPhone X',
  displayName: 'iPhone X',
  os: { minVersion: '11.0', maxVersion: '16.7' },
  esim: {
    support: 'not_supported',
    dualSim: 'none',
    maxProfiles: null,
    conditions: [],
    clarifyingQuestion: null,
    notes: '',
  },
});

const iphoneXs = iosDevice({
  _id: 'apple-iphone-xs',
  marketingName: 'iPhone XS',
  displayName: 'iPhone XS',
  os: { minVersion: '12.0', maxVersion: '18.6' },
});

const iphone11Pro = iosDevice({
  _id: 'apple-iphone-11-pro',
  marketingName: 'iPhone 11 Pro',
  displayName: 'iPhone 11 Pro',
  os: { minVersion: '13.0', maxVersion: '18.6' },
});

function toDeviceMap(devices: readonly Device[]): ReadonlyMap<string, Device> {
  return new Map(devices.map((device) => [device._id, device]));
}

function buildSignature(candidates: readonly string[]): ScreenSignatureRecord {
  return {
    signature: '375x812@3',
    zoomed: false,
    candidates: [...candidates],
    esimConsensus: 'mixed',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };
}

describe('selectIosCandidates', () => {
  it('версия iOS 17+ исключает модели, для которых эта версия не выходила (iPhone X)', () => {
    const devices = toDeviceMap([iphoneX, iphoneXs, iphone11Pro]);
    const result = selectIosCandidates(devices, '17.0', undefined);

    const ids = result.candidates.map((d) => d._id);
    expect(ids).not.toContain('apple-iphone-x');
    expect(ids).toEqual(expect.arrayContaining(['apple-iphone-xs', 'apple-iphone-11-pro']));
    expect(result.usedOsVersionRule).toBe(true);
    expect(result.usedScreenSignature).toBe(false);
  });

  it('сигнатура экрана сама по себе неоднозначна (включает iPhone X)', () => {
    const devices = toDeviceMap([iphoneX, iphoneXs, iphone11Pro]);
    const signature = buildSignature(['apple-iphone-x', 'apple-iphone-xs', 'apple-iphone-11-pro']);
    const result = selectIosCandidates(devices, undefined, signature);

    expect(result.candidates.map((d) => d._id).sort()).toEqual([
      'apple-iphone-11-pro',
      'apple-iphone-x',
      'apple-iphone-xs',
    ]);
  });

  it('версия iOS 17+ вместе с сигнатурой экрана исключает iPhone X из неоднозначной сигнатуры (docs/03 §3.5)', () => {
    const devices = toDeviceMap([iphoneX, iphoneXs, iphone11Pro]);
    const signature = buildSignature(['apple-iphone-x', 'apple-iphone-xs', 'apple-iphone-11-pro']);
    const result = selectIosCandidates(devices, '17.0', signature);

    expect(result.candidates.map((d) => d._id).sort()).toEqual([
      'apple-iphone-11-pro',
      'apple-iphone-xs',
    ]);
    expect(result.usedOsVersionRule).toBe(true);
    expect(result.usedScreenSignature).toBe(true);
  });

  it('пересечение пусто (противоречивые сигналы) — используется список сигнатуры экрана целиком', () => {
    const devices = toDeviceMap([iphoneX]);
    // iOS-версия исключила бы iphoneX полностью, но сигнатура экрана его называет —
    // при пустом пересечении отдаём приоритет прямому измерению экрана.
    const signature = buildSignature(['apple-iphone-x']);
    const result = selectIosCandidates(devices, '18.0', signature);

    expect(result.candidates.map((d) => d._id)).toEqual(['apple-iphone-x']);
  });

  it('исключает из сигнатуры экрана устройство со статусом "deprecated"', () => {
    const deprecated = iosDevice({
      _id: 'apple-iphone-deprecated',
      marketingName: 'iPhone Old',
      displayName: 'iPhone Old',
      status: 'deprecated',
      os: { minVersion: '9.0', maxVersion: '12.0' },
    });
    const devices = toDeviceMap([iphoneX, deprecated]);
    const signature = buildSignature(['apple-iphone-x', 'apple-iphone-deprecated']);

    const result = selectIosCandidates(devices, undefined, signature);

    expect(result.candidates.map((d) => d._id)).toEqual(['apple-iphone-x']);
  });

  it('без обоих сигналов не возвращает кандидатов (нет данных — не повод для догадки)', () => {
    const devices = toDeviceMap([iphoneX, iphoneXs]);
    const result = selectIosCandidates(devices, undefined, undefined);

    expect(result.candidates).toEqual([]);
    expect(result.reasons.some((r) => r.code === 'SCREEN_SIGNATURE_UNKNOWN')).toBe(true);
  });

  describe('deviceType — параметр отбора, а не константа (docs/09 ADR-034, этап 5.6)', () => {
    const ipad10 = iosDevice({
      _id: 'apple-ipad-10',
      deviceType: 'tablet',
      marketingName: 'iPad (10th generation)',
      displayName: 'Apple iPad (10th generation)',
      os: { minVersion: '16.1', maxVersion: '26.6.1' },
    });
    const ipadMini = iosDevice({
      _id: 'apple-ipad-mini-6',
      deviceType: 'tablet',
      marketingName: 'iPad mini (6th generation)',
      displayName: 'Apple iPad mini (6th generation)',
      os: { minVersion: '15.0', maxVersion: '26.6.1' },
    });

    it('по умолчанию (без deviceType) продолжает отбирать только "phone" — планшет не попадает в кандидаты телефона', () => {
      const devices = toDeviceMap([iphoneXs, ipad10]);
      const result = selectIosCandidates(devices, '18.0', undefined);

      expect(result.candidates.map((d) => d._id)).toEqual(['apple-iphone-xs']);
    });

    it('deviceType="tablet" отбирает планшеты по версии iOS и не включает телефоны той же платформы', () => {
      const devices = toDeviceMap([iphoneXs, ipad10, ipadMini]);
      const result = selectIosCandidates(devices, '17.0', undefined, 'tablet');

      const ids = result.candidates.map((d) => d._id).sort();
      expect(ids).toEqual(['apple-ipad-10', 'apple-ipad-mini-6']);
      expect(ids).not.toContain('apple-iphone-xs');
    });

    it('deviceType="tablet" вместе с сигнатурой экрана iPad (не пересекается с сигнатурами iPhone)', () => {
      const devices = toDeviceMap([iphoneX, iphoneXs, ipad10]);
      const ipadSignature: ScreenSignatureRecord = {
        signature: '820x1180@2',
        zoomed: false,
        candidates: ['apple-ipad-10'],
        esimConsensus: 'supported',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      };

      const result = selectIosCandidates(devices, '17.0', ipadSignature, 'tablet');

      expect(result.candidates.map((d) => d._id)).toEqual(['apple-ipad-10']);
    });

    it('запись справочника с deviceType="tablet" не просачивается в отбор по умолчанию через сигнатуру экрана', () => {
      const devices = toDeviceMap([ipad10]);
      const signature: ScreenSignatureRecord = {
        signature: '820x1180@2',
        zoomed: false,
        candidates: ['apple-ipad-10'],
        esimConsensus: 'supported',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      };

      const result = selectIosCandidates(devices, undefined, signature);

      expect(result.candidates).toEqual([]);
    });
  });
});

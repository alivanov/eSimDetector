import { buildSampleDevice, parseCatalogOverride, type Device } from '@esim-detector/contracts';
import { lookupAlias, lookupModelCode } from '@esim-detector/fuzzy-matcher';

import { buildCatalogSnapshot, mapDeviceToMatcherDevice } from './catalog.snapshot';

function device(overrides: Partial<Device> = {}): Device {
  return buildSampleDevice(overrides);
}

describe('mapDeviceToMatcherDevice', () => {
  it('проецирует запись справочника в структурный минимум fuzzy-matcher', () => {
    const source = device();

    const matcher = mapDeviceToMatcherDevice(source);

    expect(matcher).toEqual({
      id: source._id,
      brand: source.brand,
      family: source.family,
      generation: source.generation,
      modifiers: source.modifiers,
      modelCodes: source.modelCodes,
      aliases: source.aliases,
      marketingName: source.marketingName,
      popularity: source.popularity,
    });
  });
});

describe('buildCatalogSnapshot', () => {
  it('строит снимок на пустом справочнике без ошибок (агент 3: работать без данных)', () => {
    const snapshot = buildCatalogSnapshot([]);

    expect(snapshot.devices.size).toBe(0);
    expect(snapshot.meta.deviceCount).toBe(0);
    expect(snapshot.meta.updatedAt).toBeNull();
    expect(snapshot.meta.version).toBeTruthy();
  });

  it('версия пустого справочника детерминирована (стабильна между вызовами)', () => {
    expect(buildCatalogSnapshot([]).meta.version).toBe(buildCatalogSnapshot([]).meta.version);
  });

  it('devices содержит ВСЕ записи, включая deprecated, matchIndex — только active', () => {
    const active = device({ _id: 'active-device', status: 'active' });
    const deprecated = device({
      _id: 'deprecated-device',
      status: 'deprecated',
      modelCodes: ['SM-OLD'],
    });

    const snapshot = buildCatalogSnapshot([active, deprecated]);

    expect(snapshot.devices.size).toBe(2);
    expect(snapshot.devices.get('deprecated-device')).toBeDefined();
    expect(lookupModelCode(snapshot.matchIndex.aliasIndex, 'SM-OLD')).toBeUndefined();
    expect(lookupModelCode(snapshot.matchIndex.aliasIndex, active.modelCodes[0] ?? '')).toEqual(
      mapDeviceToMatcherDevice(active),
    );
  });

  it('meta.deviceCount учитывает все записи (не только active)', () => {
    const snapshot = buildCatalogSnapshot([
      device({ _id: 'a', status: 'active' }),
      device({ _id: 'b', status: 'deprecated' }),
    ]);

    expect(snapshot.meta.deviceCount).toBe(2);
  });

  it('meta.updatedAt — самая свежая дата обновления среди записей', () => {
    const older = device({ _id: 'older', updatedAt: new Date('2024-01-01') });
    const newer = device({ _id: 'newer', updatedAt: new Date('2024-06-01') });

    const snapshot = buildCatalogSnapshot([older, newer]);

    expect(snapshot.meta.updatedAt).toBe(new Date('2024-06-01').toISOString());
  });

  it('применяет catalog_overrides поверх записи ПОСЛЕДНИМ шагом (docs/14 §14.4 шаг 6)', () => {
    const original = device({
      _id: 'apple-iphone-x',
      esim: {
        support: 'not_supported',
        dualSim: 'none',
        maxProfiles: null,
        conditions: [],
        clarifyingQuestion: null,
        notes: '',
      },
    });
    const override = parseCatalogOverride({
      deviceId: 'apple-iphone-x',
      patch: { esim: { support: 'supported' }, dataConfidence: 'verified' },
      reason: 'подтверждено модератором вручную',
      decidedBy: 'moderator-1',
      decidedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const snapshot = buildCatalogSnapshot([original], [override]);

    expect(snapshot.devices.get('apple-iphone-x')?.esim.support).toBe('supported');
    expect(snapshot.devices.get('apple-iphone-x')?.dataConfidence).toBe('verified');
  });

  it('override без соответствующей записи справочника не влияет на снимок (не бросает исключение)', () => {
    const override = parseCatalogOverride({
      deviceId: 'unknown-device',
      patch: { dataConfidence: 'verified' },
      reason: '...',
      decidedBy: 'moderator-1',
      decidedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const snapshot = buildCatalogSnapshot([device()], [override]);

    expect(snapshot.devices.size).toBe(1);
  });

  it('запрос по псевдониму находит устройство через построенный matchIndex', () => {
    const source = device({ aliases: ['galaxy s24 ultra', 's24 ultra'] });

    const snapshot = buildCatalogSnapshot([source]);

    expect(lookupAlias(snapshot.matchIndex.aliasIndex, 's24 ultra')).toEqual(
      mapDeviceToMatcherDevice(source),
    );
  });
});

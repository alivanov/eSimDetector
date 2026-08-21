import { buildSampleDevice, type Device } from '@esim-detector/contracts';

import type { CatalogService } from '../catalog/catalog.service';
import type { CatalogSnapshot } from '../catalog/catalog.snapshot';

import { DeviceCatalogQueryService } from './device-catalog-query.service';

function buildFakeCatalogService(devices: readonly Device[]): CatalogService {
  const snapshot: Pick<CatalogSnapshot, 'devices'> = {
    devices: new Map(devices.map((device) => [device._id, device])),
  };
  const fake: Pick<CatalogService, 'getSnapshot'> = {
    getSnapshot: () => snapshot as CatalogSnapshot,
  };
  return fake as CatalogService;
}

/**
 * `DeviceCatalogQueryService` (docs/06-api-contract.md §6.4, этап 8) — `GET /devices/{id}`,
 * `GET /devices`, `GET /brands`. Только записи `status: "active"` попадают в публичный каталог.
 */
describe('DeviceCatalogQueryService', () => {
  it('getByIdOrThrow возвращает карточку активного устройства без provenance', () => {
    const device = buildSampleDevice();
    const service = new DeviceCatalogQueryService(buildFakeCatalogService([device]));

    const card = service.getByIdOrThrow(device._id);

    expect(card.id).toBe(device._id);
    expect(card.marketingName).toBe(device.marketingName);
    expect(card.sources).toEqual(device.sources);
    expect(card).not.toHaveProperty('provenance');
  });

  it('getByIdOrThrow бросает DEVICE_NOT_FOUND для неизвестного идентификатора', () => {
    const service = new DeviceCatalogQueryService(buildFakeCatalogService([]));

    expect(() => service.getByIdOrThrow('unknown-device')).toThrow('не найдено');
  });

  it('getByIdOrThrow бросает DEVICE_NOT_FOUND для устаревшей (deprecated) записи', () => {
    const device = buildSampleDevice({ status: 'deprecated' });
    const service = new DeviceCatalogQueryService(buildFakeCatalogService([device]));

    expect(() => service.getByIdOrThrow(device._id)).toThrow('не найдено');
  });

  it('list фильтрует по brand и platform, отдаёт стабильную сортировку и постраничность', () => {
    const devices = [
      buildSampleDevice({ _id: 'samsung-galaxy-s24-ultra', brandTitle: 'Samsung' }),
      buildSampleDevice({
        _id: 'apple-iphone-15',
        brand: 'apple',
        brandTitle: 'Apple',
        platform: 'ios',
        displayName: 'Apple iPhone 15',
      }),
      buildSampleDevice({
        _id: 'samsung-galaxy-a54',
        brand: 'samsung',
        brandTitle: 'Samsung',
        displayName: 'Samsung Galaxy A54',
      }),
    ];
    const service = new DeviceCatalogQueryService(buildFakeCatalogService(devices));

    const result = service.list({ brand: 'samsung', page: 1, pageSize: 20 });

    expect(result.total).toBe(2);
    expect(result.items.map((item) => item.id)).toEqual([
      'samsung-galaxy-a54',
      'samsung-galaxy-s24-ultra',
    ]);
  });

  it('list не показывает устаревшие (deprecated) записи', () => {
    const devices = [
      buildSampleDevice({ _id: 'active-device' }),
      buildSampleDevice({ _id: 'deprecated-device', status: 'deprecated' }),
    ];
    const service = new DeviceCatalogQueryService(buildFakeCatalogService(devices));

    const result = service.list({ page: 1, pageSize: 20 });

    expect(result.total).toBe(1);
    expect(result.items[0]?.id).toBe('active-device');
  });

  it('listBrands агрегирует число активных устройств по бренду', () => {
    const devices = [
      buildSampleDevice({ _id: 'samsung-galaxy-s24-ultra' }),
      buildSampleDevice({ _id: 'samsung-galaxy-a54' }),
      buildSampleDevice({
        _id: 'apple-iphone-15',
        brand: 'apple',
        brandTitle: 'Apple',
        platform: 'ios',
      }),
    ];
    const service = new DeviceCatalogQueryService(buildFakeCatalogService(devices));

    const brands = service.listBrands();

    expect(brands).toEqual([
      { brand: 'apple', brandTitle: 'Apple', deviceCount: 1 },
      { brand: 'samsung', brandTitle: 'Samsung', deviceCount: 2 },
    ]);
  });
});

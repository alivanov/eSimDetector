import { buildSampleDevice, type Device } from '@esim-detector/contracts';

import { buildCatalogSnapshot } from '../catalog/catalog.snapshot';
import type { CatalogService } from '../catalog/catalog.service';

import { AdminDeviceQueryService } from './admin-device-query.service';

function buildService(devices: readonly Device[]): AdminDeviceQueryService {
  const snapshot = buildCatalogSnapshot(devices);
  const fake: Pick<CatalogService, 'getSnapshot'> = { getSnapshot: () => snapshot };
  return new AdminDeviceQueryService(fake as CatalogService);
}

const s9 = buildSampleDevice({ _id: 'samsung-galaxy-s9', displayName: 'Samsung Galaxy S9' });
const iphone = buildSampleDevice({
  _id: 'apple-iphone-13-mini',
  brand: 'apple',
  displayName: 'Apple iPhone 13 mini',
});

/** «Поиск и редактирование записи справочника» (docs/15-moderation.md §15.7). */
describe('AdminDeviceQueryService', () => {
  it('search без запроса возвращает все устройства (до предела)', () => {
    const service = buildService([s9, iphone]);
    expect(
      service
        .search(undefined)
        .map((d) => d._id)
        .sort(),
    ).toEqual(['apple-iphone-13-mini', 'samsung-galaxy-s9']);
  });

  it('search по подстроке названия сужает список', () => {
    const service = buildService([s9, iphone]);
    const result = service.search('iphone');
    expect(result).toHaveLength(1);
    expect(result[0]?._id).toBe('apple-iphone-13-mini');
  });

  it('search по бренду находит устройство', () => {
    const service = buildService([s9, iphone]);
    expect(service.search('samsung').map((d) => d._id)).toEqual(['samsung-galaxy-s9']);
  });

  it('search по пустой строке ведёт себя как без запроса', () => {
    const service = buildService([s9, iphone]);
    expect(service.search('   ')).toHaveLength(2);
  });

  it('getByIdOrThrow бросает DEVICE_NOT_FOUND на отсутствующем идентификаторе', () => {
    const service = buildService([s9]);
    expect(() => service.getByIdOrThrow('unknown-device')).toThrow('не найдено');
  });

  it('getByIdOrThrow возвращает устройство при совпадении', () => {
    const service = buildService([s9]);
    expect(service.getByIdOrThrow('samsung-galaxy-s9')).toBe(s9);
  });
});

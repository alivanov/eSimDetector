import { buildSampleDevice, type Device } from '@esim-detector/contracts';

import { buildCatalogSnapshot } from '../catalog/catalog.snapshot';
import type { CatalogService } from '../catalog/catalog.service';

import { CatalogStatsService } from './catalog-stats.service';
import type { ListModerationTasksResult, ModerationTaskService } from './moderation-task.service';

function buildFakeCatalogService(devices: readonly Device[]): CatalogService {
  const snapshot = buildCatalogSnapshot(devices);
  const fake: Pick<CatalogService, 'getSnapshot'> = { getSnapshot: () => snapshot };
  return fake as CatalogService;
}

function buildFakeTaskService(openTaskCount: number): ModerationTaskService {
  const result: ListModerationTasksResult = {
    items: [],
    total: openTaskCount,
    page: 1,
    pageSize: 1,
  };
  const fake: Pick<ModerationTaskService, 'list'> = { list: () => Promise.resolve(result) };
  return fake as ModerationTaskService;
}

/** «Сводка состояния справочника» (docs/15-moderation.md §15.7). */
describe('CatalogStatsService', () => {
  it('считает устройства по брендам и уровням достоверности, добавляет размер очереди', async () => {
    const devices = [
      buildSampleDevice({ _id: 'a', brand: 'samsung', dataConfidence: 'verified' }),
      buildSampleDevice({ _id: 'b', brand: 'samsung', dataConfidence: 'derived' }),
      buildSampleDevice({ _id: 'c', brand: 'apple', dataConfidence: 'verified' }),
    ];
    const service = new CatalogStatsService(
      buildFakeCatalogService(devices),
      buildFakeTaskService(5),
    );

    const stats = await service.getStats();

    expect(stats.deviceCount).toBe(3);
    expect(stats.byBrand).toEqual({ samsung: 2, apple: 1 });
    expect(stats.byDataConfidence).toEqual({
      verified: 2,
      derived: 1,
      unverified: 0,
      quarantined: 0,
    });
    expect(stats.openTaskCount).toBe(5);
  });

  it('возвращает нулевую статистику на пустом справочнике', async () => {
    const service = new CatalogStatsService(buildFakeCatalogService([]), buildFakeTaskService(0));

    const stats = await service.getStats();

    expect(stats.deviceCount).toBe(0);
    expect(stats.byBrand).toEqual({});
    expect(stats.openTaskCount).toBe(0);
  });
});

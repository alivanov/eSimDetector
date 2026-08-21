import { buildSampleDevice, type Device } from '@esim-detector/contracts';

import { AdminCatalogController } from './admin-catalog.controller';
import type { AdminDeviceQueryService } from './admin-device-query.service';
import type { CatalogReloadService, ReloadResult } from './catalog-reload.service';
import type { CatalogStats, CatalogStatsService } from './catalog-stats.service';
import type { CatalogWriteService } from './catalog-write.service';
import type { CreateDeviceDto } from './dto/create-device.dto';
import type { UpdateDeviceDto } from './dto/update-device.dto';
import type {
  CatalogChangeLogService,
  ListCatalogChangesResult,
} from './catalog-change-log.service';
import type { ModerationTaskService } from './moderation-task.service';

function buildController(
  overrides: Partial<{
    deviceQueryService: Partial<AdminDeviceQueryService>;
    catalogWriteService: Partial<CatalogWriteService>;
    catalogStatsService: Partial<CatalogStatsService>;
    catalogReloadService: Partial<CatalogReloadService>;
    changeLogService: Partial<CatalogChangeLogService>;
    taskService: Partial<ModerationTaskService>;
  }> = {},
): AdminCatalogController {
  return new AdminCatalogController(
    (overrides.deviceQueryService ?? {}) as AdminDeviceQueryService,
    (overrides.catalogWriteService ?? {}) as CatalogWriteService,
    (overrides.catalogStatsService ?? {}) as CatalogStatsService,
    (overrides.catalogReloadService ?? {}) as CatalogReloadService,
    (overrides.changeLogService ?? {}) as CatalogChangeLogService,
    (overrides.taskService ?? {}) as ModerationTaskService,
  );
}

const SAMPLE_DEVICE: Device = buildSampleDevice();

/** `AdminCatalogController` (docs/15-moderation.md §15.8) — контроллер без бизнес-логики. */
describe('AdminCatalogController', () => {
  it('searchDevices делегирует в AdminDeviceQueryService.search', () => {
    const search = jest.fn(() => [SAMPLE_DEVICE]);
    const controller = buildController({ deviceQueryService: { search } });

    const result = controller.searchDevices('galaxy');

    expect(search).toHaveBeenCalledWith('galaxy');
    expect(result).toEqual([SAMPLE_DEVICE]);
  });

  it('getDevice делегирует в AdminDeviceQueryService.getByIdOrThrow', () => {
    const getByIdOrThrow = jest.fn(() => SAMPLE_DEVICE);
    const controller = buildController({ deviceQueryService: { getByIdOrThrow } });

    const result = controller.getDevice('samsung-galaxy-s24-ultra');

    expect(getByIdOrThrow).toHaveBeenCalledWith('samsung-galaxy-s24-ultra');
    expect(result).toBe(SAMPLE_DEVICE);
  });

  it('createDevice создаёт запись и закрывает задачу, если указан resolvesTaskId', async () => {
    const createDevice = jest.fn(() => Promise.resolve(SAMPLE_DEVICE));
    const markResolved = jest.fn(() => Promise.resolve());
    const controller = buildController({
      catalogWriteService: { createDevice },
      taskService: { markResolved },
    });
    const body: CreateDeviceDto = {
      id: 'xiaomi-poco-x7-pro',
      brand: 'xiaomi',
      brandTitle: 'POCO',
      marketingName: 'X7 Pro',
      family: 'poco-x',
      platform: 'android',
      deviceType: 'phone',
      esimSupport: 'supported',
      releaseYear: 2025,
      decidedBy: 'moderator-1',
      reason: 'создано вручную',
      sources: [{ url: 'https://www.mi.com', title: 'Xiaomi' }],
      resolvesTaskId: 'task-1',
    };

    const result = await controller.createDevice(body);

    expect(createDevice).toHaveBeenCalled();
    expect(markResolved).toHaveBeenCalledWith('task-1', 'moderator-1', 'создано вручную');
    expect(result).toBe(SAMPLE_DEVICE);
  });

  it('createDevice не закрывает задачу, если resolvesTaskId не указан', async () => {
    const createDevice = jest.fn(() => Promise.resolve(SAMPLE_DEVICE));
    const markResolved = jest.fn(() => Promise.resolve());
    const controller = buildController({
      catalogWriteService: { createDevice },
      taskService: { markResolved },
    });
    const body: CreateDeviceDto = {
      id: 'xiaomi-poco-x7-pro',
      brand: 'xiaomi',
      brandTitle: 'POCO',
      marketingName: 'X7 Pro',
      family: 'poco-x',
      platform: 'android',
      deviceType: 'phone',
      esimSupport: 'not_supported',
      releaseYear: 2025,
      decidedBy: 'moderator-1',
      reason: 'создано вручную',
    };

    await controller.createDevice(body);

    expect(markResolved).not.toHaveBeenCalled();
  });

  it('updateDevice собирает CatalogOverridePatch только из заданных полей DTO', () => {
    const genericPatch = jest.fn(() => Promise.resolve(SAMPLE_DEVICE));
    const controller = buildController({ catalogWriteService: { genericPatch } });
    const body: UpdateDeviceDto = {
      deviceType: 'tablet',
      decidedBy: 'moderator-1',
      reason: 'на самом деле планшет',
    };

    void controller.updateDevice('samsung-galaxy-tab', body);

    expect(genericPatch).toHaveBeenCalledWith(
      'samsung-galaxy-tab',
      { deviceType: 'tablet' },
      'на самом деле планшет',
      'moderator-1',
    );
  });

  it('addAlias делегирует в CatalogWriteService.addAlias с автоматической причиной', () => {
    const addAlias = jest.fn(() => Promise.resolve(SAMPLE_DEVICE));
    const controller = buildController({ catalogWriteService: { addAlias } });

    void controller.addAlias({
      deviceId: 'samsung-galaxy-s24-ultra',
      alias: 'ультра',
      decidedBy: 'moderator-1',
    });

    expect(addAlias).toHaveBeenCalledWith(
      'samsung-galaxy-s24-ultra',
      'ультра',
      'Псевдоним добавлен модератором moderator-1',
      'moderator-1',
    );
  });

  it('getChanges применяет постраничные значения по умолчанию', () => {
    const changesResult: ListCatalogChangesResult = { items: [], total: 0, page: 1, pageSize: 20 };
    const list = jest.fn(() => Promise.resolve(changesResult));
    const controller = buildController({ changeLogService: { list } });

    void controller.getChanges({});

    expect(list).toHaveBeenCalledWith({ page: 1, pageSize: 20 });
  });

  it('getStats и reload делегируют без изменений', async () => {
    const stats: CatalogStats = {
      deviceCount: 1,
      updatedAt: null,
      byBrand: {},
      byDataConfidence: { verified: 0, derived: 0, unverified: 0, quarantined: 0 },
      openTaskCount: 0,
      screenSignatureCount: 0,
    };
    const reloadResult: ReloadResult = { deviceCount: 1, screenSignatureReady: true };
    const getStats = jest.fn(() => Promise.resolve(stats));
    const reload = jest.fn(() => Promise.resolve(reloadResult));
    const controller = buildController({
      catalogStatsService: { getStats },
      catalogReloadService: { reload },
    });

    expect(await controller.getStats()).toBe(stats);
    expect(await controller.reload()).toBe(reloadResult);
  });
});

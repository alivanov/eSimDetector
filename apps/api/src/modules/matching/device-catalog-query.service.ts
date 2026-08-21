import { HttpStatus, Injectable } from '@nestjs/common';
import type { Platform } from '@esim-detector/contracts';

import { ApiError } from '../../common/errors/api-error';
import { toDeviceCard, type DeviceCard } from '../../common/response';
import { CatalogService } from '../catalog/catalog.service';

export interface ListDevicesOptions {
  readonly brand?: string;
  readonly platform?: Platform;
  readonly page: number;
  readonly pageSize: number;
}

export interface ListDevicesResult {
  readonly items: readonly DeviceCard[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

export interface BrandSummary {
  readonly brand: string;
  readonly brandTitle: string;
  readonly deviceCount: number;
}

/**
 * `GET /api/v1/devices/{id}`, `GET /api/v1/devices?brand=&platform=&page=`, `GET /api/v1/brands`
 * (docs/06-api-contract.md §6.4) — реализация объёма дорожки API этапа 8 (эндпоинты, оставленные
 * agent 6.2 нереализованными). Читает только уже прогретый снимок `CatalogService`
 * (.cursor/rules/api-boundaries.mdc: «доступ к справочнику только через `CatalogModule`»,
 * «горячий путь идёт через кэш в памяти, обращений к базе в нём нет») — те же данные, что и
 * `AdminDeviceQueryService` раздела `/admin`, но эндпоинт публичный (без `ADMIN_TOKEN`) и
 * ограничен записями `status: "active"` (устаревшие записи не показываются в публичном каталоге,
 * как и в индексах сопоставления, `catalog.snapshot.ts`).
 */
@Injectable()
export class DeviceCatalogQueryService {
  public constructor(private readonly catalogService: CatalogService) {}

  private activeDevices() {
    return [...this.catalogService.getSnapshot().devices.values()].filter(
      (device) => device.status === 'active',
    );
  }

  public getByIdOrThrow(deviceId: string): DeviceCard {
    const device = this.catalogService.getSnapshot().devices.get(deviceId);
    if (device === undefined || device.status !== 'active') {
      throw new ApiError(
        'DEVICE_NOT_FOUND',
        `Устройство "${deviceId}" не найдено`,
        HttpStatus.NOT_FOUND,
      );
    }
    return toDeviceCard(device);
  }

  public list(options: ListDevicesOptions): ListDevicesResult {
    const normalizedBrand = options.brand?.trim().toLowerCase();
    const filtered = this.activeDevices().filter(
      (device) =>
        (normalizedBrand === undefined || device.brand.toLowerCase() === normalizedBrand) &&
        (options.platform === undefined || device.platform === options.platform),
    );
    // Стабильный порядок постраничной выдачи: по бренду и названию, а не по порядку вставки в
    // Map (который не гарантирован документированным контрактом снимка).
    const sorted = [...filtered].sort(
      (a, b) =>
        a.brandTitle.localeCompare(b.brandTitle) || a.displayName.localeCompare(b.displayName),
    );
    const start = (options.page - 1) * options.pageSize;
    const page = sorted.slice(start, start + options.pageSize).map(toDeviceCard);

    return { items: page, total: sorted.length, page: options.page, pageSize: options.pageSize };
  }

  /** «Перечень брендов для первого шага ручного выбора» (docs/06 §6.4). */
  public listBrands(): readonly BrandSummary[] {
    const counts = new Map<string, BrandSummary>();
    for (const device of this.activeDevices()) {
      const existing = counts.get(device.brand);
      if (existing === undefined) {
        counts.set(device.brand, {
          brand: device.brand,
          brandTitle: device.brandTitle,
          deviceCount: 1,
        });
        continue;
      }
      counts.set(device.brand, { ...existing, deviceCount: existing.deviceCount + 1 });
    }
    return [...counts.values()].sort((a, b) => a.brandTitle.localeCompare(b.brandTitle));
  }
}

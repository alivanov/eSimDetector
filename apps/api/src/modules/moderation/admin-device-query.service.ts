import { HttpStatus, Injectable } from '@nestjs/common';
import type { Device } from '@esim-detector/contracts';

import { ApiError } from '../../common/errors/api-error';
import { CatalogService } from '../catalog/catalog.service';

const MAX_SEARCH_RESULTS = 30;

/**
 * «Поиск и редактирование записи справочника» (docs/15-moderation.md §15.7) — раздел `/admin`
 * не переиспользует публичный `MatchingService` (тот отдаёт единственный лучший результат или
 * уточнение, а не список для линейного просмотра специалистом; кроме того, зависимость от
 * `MatchingModule` создала бы цикл, см. `suggestions.service.ts`). Простой поиск подстрокой по
 * уже прогретому снимку `CatalogService` — объём достаточен для рабочего инструмента специалиста
 * (ADR-025 п.6), не полноценной системы управления данными.
 */
@Injectable()
export class AdminDeviceQueryService {
  public constructor(private readonly catalogService: CatalogService) {}

  public search(query: string | undefined): readonly Device[] {
    const devices = [...this.catalogService.getSnapshot().devices.values()];
    if (query === undefined || query.trim().length === 0) {
      return devices.slice(0, MAX_SEARCH_RESULTS);
    }

    const normalizedQuery = query.trim().toLowerCase();
    return devices
      .filter(
        (device) =>
          device.displayName.toLowerCase().includes(normalizedQuery) ||
          device.brand.toLowerCase().includes(normalizedQuery) ||
          device.modelCodes.some((code) => code.toLowerCase().includes(normalizedQuery)) ||
          device.aliases.some((alias) => alias.includes(normalizedQuery)),
      )
      .slice(0, MAX_SEARCH_RESULTS);
  }

  public getByIdOrThrow(deviceId: string): Device {
    const device = this.catalogService.getSnapshot().devices.get(deviceId);
    if (device === undefined) {
      throw new ApiError(
        'DEVICE_NOT_FOUND',
        `Устройство "${deviceId}" не найдено`,
        HttpStatus.NOT_FOUND,
      );
    }
    return device;
  }
}

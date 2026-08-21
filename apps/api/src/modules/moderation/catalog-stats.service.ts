import { Injectable } from '@nestjs/common';
import type { DataConfidence } from '@esim-detector/contracts';

import { CatalogService } from '../catalog/catalog.service';

import { ModerationTaskService } from './moderation-task.service';

export interface CatalogStats {
  readonly deviceCount: number;
  readonly updatedAt: string | null;
  readonly byBrand: Readonly<Record<string, number>>;
  readonly byDataConfidence: Readonly<Record<DataConfidence, number>>;
  readonly openTaskCount: number;
}

/**
 * «Сводка состояния справочника» (docs/15-moderation.md §15.7): число записей по брендам и
 * уровням достоверности, дата последнего импорта, размер очереди. Читает уже прогретый снимок
 * `CatalogService` — без обращения к базе на каждый запрос (ADR-005).
 */
@Injectable()
export class CatalogStatsService {
  public constructor(
    private readonly catalogService: CatalogService,
    private readonly taskService: ModerationTaskService,
  ) {}

  public async getStats(): Promise<CatalogStats> {
    const snapshot = this.catalogService.getSnapshot();
    const byBrand: Record<string, number> = {};
    const byDataConfidence: Record<DataConfidence, number> = {
      verified: 0,
      derived: 0,
      unverified: 0,
      quarantined: 0,
    };

    for (const device of snapshot.devices.values()) {
      byBrand[device.brand] = (byBrand[device.brand] ?? 0) + 1;
      byDataConfidence[device.dataConfidence] += 1;
    }

    const openTasks = await this.taskService.list({ status: 'open', page: 1, pageSize: 1 });

    return {
      deviceCount: snapshot.meta.deviceCount,
      updatedAt: snapshot.meta.updatedAt,
      byBrand,
      byDataConfidence,
      openTaskCount: openTasks.total,
    };
  }
}

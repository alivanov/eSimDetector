import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { CatalogChangeAction, CatalogChangeEntry } from '@esim-detector/contracts';
import { parseCatalogChangeEntry } from '@esim-detector/contracts';
import type { Model } from 'mongoose';

import { normalizeMongoId } from './normalize-mongo-id';
import { CATALOG_CHANGE_MODEL_NAME } from './schemas/catalog-change.schema';

export interface AppendCatalogChangeInput {
  readonly deviceId: string | null;
  readonly taskId: string | null;
  readonly action: CatalogChangeAction;
  readonly field: string | null;
  readonly previousValue: unknown;
  readonly newValue: unknown;
  readonly reason: string;
  readonly decidedBy: string;
}

export interface ListCatalogChangesOptions {
  readonly deviceId?: string;
  readonly page: number;
  readonly pageSize: number;
}

export interface ListCatalogChangesResult {
  readonly items: readonly CatalogChangeEntry[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

/**
 * Журнал изменений `catalog_changes` (docs/15-moderation.md §15.6) — только для чтения через
 * API (`GET /api/v1/admin/changes`); пишется исключительно `ModerationCatalogWriteService` при
 * применении решения. Каждая запись отдельна и неизменяема — метод обновления не предусмотрен.
 */
@Injectable()
export class CatalogChangeLogService {
  public constructor(
    @InjectModel(CATALOG_CHANGE_MODEL_NAME) private readonly model: Model<CatalogChangeEntry>,
  ) {}

  public async append(input: AppendCatalogChangeInput): Promise<void> {
    await this.model.create({ ...input, createdAt: new Date() });
  }

  public async list(options: ListCatalogChangesOptions): Promise<ListCatalogChangesResult> {
    const filter: Record<string, unknown> = {};
    if (options.deviceId !== undefined) {
      filter['deviceId'] = options.deviceId;
    }

    const skip = (options.page - 1) * options.pageSize;
    const [rawItems, total] = await Promise.all([
      this.model
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(options.pageSize)
        .lean()
        .exec(),
      this.model.countDocuments(filter).exec(),
    ]);

    return {
      items: rawItems.map((raw) => parseCatalogChangeEntry(normalizeMongoId(raw))),
      total,
      page: options.page,
      pageSize: options.pageSize,
    };
  }
}

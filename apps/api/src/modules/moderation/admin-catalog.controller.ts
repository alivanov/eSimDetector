import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { CatalogOverridePatch, Device } from '@esim-detector/contracts';

import { AdminDeviceQueryService } from './admin-device-query.service';
import { AdminTokenGuard } from './admin-token.guard';
import { buildDeviceFromDto } from './build-device-from-dto';
import { CatalogReloadService, type ReloadResult } from './catalog-reload.service';
import { CatalogStatsService, type CatalogStats } from './catalog-stats.service';
import { CatalogWriteService } from './catalog-write.service';
import { AddAliasDto } from './dto/add-alias.dto';
import { ListChangesQueryDto } from './dto/list-changes-query.dto';
import { CreateDeviceDto } from './dto/create-device.dto';
import { UpdateDeviceDto } from './dto/update-device.dto';
import {
  CatalogChangeLogService,
  type ListCatalogChangesResult,
} from './catalog-change-log.service';
import { ModerationTaskService } from './moderation-task.service';

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;

/**
 * Группа `/api/v1/admin/*` (docs/15-moderation.md §15.8), кроме очереди задач (см.
 * `moderation-tasks.controller.ts`) — устройства, псевдонимы, журнал изменений, сводка
 * справочника, перечитывание кэша. Контроллер без бизнес-логики
 * (.cursor/rules/api-boundaries.mdc); за `AdminTokenGuard` (ADR-025 п.5).
 */
@ApiTags('admin')
@Controller('admin')
@UseGuards(AdminTokenGuard)
export class AdminCatalogController {
  public constructor(
    private readonly deviceQueryService: AdminDeviceQueryService,
    private readonly catalogWriteService: CatalogWriteService,
    private readonly catalogStatsService: CatalogStatsService,
    private readonly catalogReloadService: CatalogReloadService,
    private readonly changeLogService: CatalogChangeLogService,
    private readonly taskService: ModerationTaskService,
  ) {}

  @Get('devices')
  public searchDevices(@Query('q') q?: string): readonly Device[] {
    return this.deviceQueryService.search(q);
  }

  @Get('devices/:id')
  public getDevice(@Param('id') id: string): Device {
    return this.deviceQueryService.getByIdOrThrow(id);
  }

  @Post('devices')
  @HttpCode(HttpStatus.CREATED)
  public async createDevice(@Body() body: CreateDeviceDto): Promise<Device> {
    const device = buildDeviceFromDto(body, new Date());
    const created = await this.catalogWriteService.createDevice({
      device,
      reason: body.reason,
      decidedBy: body.decidedBy,
    });

    if (body.resolvesTaskId !== undefined) {
      await this.taskService.markResolved(body.resolvesTaskId, body.decidedBy, body.reason);
    }

    return created;
  }

  @Patch('devices/:id')
  public updateDevice(@Param('id') id: string, @Body() body: UpdateDeviceDto): Promise<Device> {
    const patch: CatalogOverridePatch = {
      ...(body.esim !== undefined ? { esim: body.esim } : {}),
      ...(body.dataConfidence !== undefined ? { dataConfidence: body.dataConfidence } : {}),
      ...(body.sources !== undefined
        ? { sources: body.sources.map((source) => ({ ...source, checkedAt: new Date() })) }
        : {}),
      ...(body.status !== undefined ? { status: body.status } : {}),
      ...(body.modelCodes !== undefined ? { modelCodes: body.modelCodes } : {}),
      ...(body.aliases !== undefined ? { aliases: body.aliases } : {}),
      ...(body.deviceType !== undefined ? { deviceType: body.deviceType } : {}),
    };

    return this.catalogWriteService.genericPatch(id, patch, body.reason, body.decidedBy);
  }

  @Post('aliases')
  public addAlias(@Body() body: AddAliasDto): Promise<Device> {
    return this.catalogWriteService.addAlias(
      body.deviceId,
      body.alias,
      `Псевдоним добавлен модератором ${body.decidedBy}`,
      body.decidedBy,
    );
  }

  @Get('changes')
  public getChanges(@Query() query: ListChangesQueryDto): Promise<ListCatalogChangesResult> {
    return this.changeLogService.list({
      ...(query.deviceId !== undefined ? { deviceId: query.deviceId } : {}),
      page: query.page ?? DEFAULT_PAGE,
      pageSize: query.pageSize ?? DEFAULT_PAGE_SIZE,
    });
  }

  @Get('catalog/stats')
  public getStats(): Promise<CatalogStats> {
    return this.catalogStatsService.getStats();
  }

  @Post('catalog/reload')
  public reload(): Promise<ReloadResult> {
    return this.catalogReloadService.reload();
  }
}

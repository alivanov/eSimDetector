import { HttpStatus, Injectable } from '@nestjs/common';
import type { Device, DeviceSource } from '@esim-detector/contracts';

import { ApiError } from '../../common/errors/api-error';

import { CatalogWriteService } from './catalog-write.service';
import type { ResolveModerationTaskDto } from './dto/resolve-task.dto';
import { ModerationTaskService } from './moderation-task.service';

function requireField<T>(value: T | undefined, fieldName: string): T {
  if (value === undefined) {
    throw new ApiError(
      'VALIDATION_ERROR',
      `Поле "${fieldName}" обязательно для выбранного действия`,
      HttpStatus.BAD_REQUEST,
    );
  }
  return value;
}

/**
 * Ссылка на источник, указанная модератором, — `undefined`, когда `sourceUrl` не заполнен.
 * Именно от этого значения зависит, получит ли запись уровень `verified` (docs/15 §15.4):
 * решение применяется в обоих случаях, но без ссылки достоверность записи не повышается.
 */
function buildSource(dto: ResolveModerationTaskDto, checkedAt: Date): DeviceSource | undefined {
  if (dto.sourceUrl === undefined) {
    return undefined;
  }
  return {
    url: dto.sourceUrl,
    title: dto.sourceTitle ?? 'Подтверждено модератором',
    checkedAt,
  };
}

export interface ResolveOutcome {
  readonly taskStatus: 'resolved' | 'rejected';
  readonly device?: Device;
}

/**
 * Диспетчер `POST /api/v1/admin/moderation/tasks/{id}/resolve` (docs/15-moderation.md §15.4) —
 * проверяет допустимость сочетания «действие × тип задачи» (бизнес-правило, поэтому здесь, а не
 * в контроллере или в декораторах DTO) и вызывает соответствующий метод `CatalogWriteService`.
 *
 * `reason` (обоснование для журнала §15.6) и `sourceUrl` (ссылка на источник) — РАЗНЫЕ поля, и
 * уровень `verified` даёт только второе: docs/15 §15.4 требует именно ссылку, а свободный текст
 * обоснования ею не является (docs/09-decisions.md ADR-044). Само правило проверяется в
 * `CatalogWriteService` — единственной точке записи, поэтому здесь достаточно передать источник
 * дальше, не дублируя проверку.
 */
@Injectable()
export class ModerationResolutionService {
  public constructor(
    private readonly taskService: ModerationTaskService,
    private readonly catalogWriteService: CatalogWriteService,
  ) {}

  public async resolve(taskId: string, dto: ResolveModerationTaskDto): Promise<ResolveOutcome> {
    const task = await this.taskService.getByIdOrThrow(taskId);
    const source = buildSource(dto, new Date());

    if (dto.action === 'reject') {
      await this.taskService.markRejected(taskId, dto.decidedBy, requireField(dto.note, 'note'));
      return { taskStatus: 'rejected' };
    }

    if (task.kind === 'unknown_model_code' && dto.action === 'link_model_code') {
      const device = await this.catalogWriteService.linkModelCode({
        deviceId: requireField(dto.deviceId, 'deviceId'),
        code: task.payload.code,
        reason: requireField(dto.reason, 'reason'),
        decidedBy: dto.decidedBy,
        taskId,
        ...(source !== undefined ? { source } : {}),
      });
      await this.taskService.markResolved(
        taskId,
        dto.decidedBy,
        requireField(dto.reason, 'reason'),
      );
      return { taskStatus: 'resolved', device };
    }

    if (task.kind === 'unknown_screen_signature' && dto.action === 'link_screen_signature') {
      const device = await this.catalogWriteService.linkScreenSignature({
        deviceId: requireField(dto.deviceId, 'deviceId'),
        signature: {
          cssWidth: task.payload.cssWidth,
          cssHeight: task.payload.cssHeight,
          dpr: task.payload.dpr,
          zoomed: task.payload.zoomed,
        },
        reason: requireField(dto.reason, 'reason'),
        decidedBy: dto.decidedBy,
        taskId,
        ...(source !== undefined ? { source } : {}),
      });
      await this.taskService.markResolved(
        taskId,
        dto.decidedBy,
        requireField(dto.reason, 'reason'),
      );
      return { taskStatus: 'resolved', device };
    }

    if (task.kind === 'csv_quarantine' && dto.action === 'confirm_quarantine') {
      const deviceId = requireField(dto.deviceId, 'deviceId');
      const aliasSource = task.payload.rawMarketingName ?? task.payload.detail;
      const device = await this.catalogWriteService.addAlias(
        deviceId,
        aliasSource,
        requireField(dto.reason, 'reason'),
        dto.decidedBy,
      );
      await this.taskService.markResolved(
        taskId,
        dto.decidedBy,
        requireField(dto.reason, 'reason'),
      );
      return { taskStatus: 'resolved', device };
    }

    if (task.kind === 'csv_quarantine' && dto.action === 'reject_quarantine') {
      await this.taskService.markRejected(taskId, dto.decidedBy, requireField(dto.note, 'note'));
      return { taskStatus: 'rejected' };
    }

    if (task.kind === 'source_disagreement' && dto.action === 'resolve_source_disagreement') {
      const esimSupport = requireField(dto.esimSupport, 'esimSupport');
      const reason = requireField(dto.reason, 'reason');
      const device = await this.catalogWriteService.changeEsimStatus(
        task.payload.deviceId,
        { support: esimSupport },
        'verified',
        [requireField(source, 'sourceUrl')],
        reason,
        dto.decidedBy,
        taskId,
      );
      await this.taskService.markResolved(taskId, dto.decidedBy, reason);
      return { taskStatus: 'resolved', device };
    }

    if (task.kind === 'user_feedback' && dto.action === 'acknowledge_feedback') {
      if (dto.deviceId !== undefined && dto.esimSupport !== undefined) {
        const reason = requireField(dto.reason, 'reason');
        const device = await this.catalogWriteService.changeEsimStatus(
          dto.deviceId,
          { support: dto.esimSupport },
          'verified',
          [requireField(source, 'sourceUrl')],
          reason,
          dto.decidedBy,
          taskId,
        );
        await this.taskService.markResolved(taskId, dto.decidedBy, reason);
        return { taskStatus: 'resolved', device };
      }
      await this.taskService.markResolved(
        taskId,
        dto.decidedBy,
        dto.note ?? 'Обращение рассмотрено без изменения справочника',
      );
      return { taskStatus: 'resolved' };
    }

    if (task.kind === 'ambiguous_query' && dto.action === 'link_model_code') {
      // Для `ambiguous_query`/`unmatched_query` типовое решение — псевдоним (docs/15 §15.3:
      // «часто нужно просто добавить псевдоним, а не создавать устройство»); `link_model_code`
      // переиспользуется как «добавить псевдоним» для текстового запроса намеренно — оба действия
      // технически одинаковы (объединение массива на существующем устройстве), различается лишь
      // то, какое поле объединяется, поэтому здесь вызывается `addAlias`, а не `linkModelCode`.
      const device = await this.catalogWriteService.addAlias(
        requireField(dto.deviceId, 'deviceId'),
        task.payload.rawQuery,
        requireField(dto.reason, 'reason'),
        dto.decidedBy,
      );
      await this.taskService.markResolved(
        taskId,
        dto.decidedBy,
        requireField(dto.reason, 'reason'),
      );
      return { taskStatus: 'resolved', device };
    }

    if (task.kind === 'unmatched_query' && dto.action === 'link_model_code') {
      const device = await this.catalogWriteService.addAlias(
        requireField(dto.deviceId, 'deviceId'),
        task.payload.rawQuery,
        requireField(dto.reason, 'reason'),
        dto.decidedBy,
      );
      await this.taskService.markResolved(
        taskId,
        dto.decidedBy,
        requireField(dto.reason, 'reason'),
      );
      return { taskStatus: 'resolved', device };
    }

    throw new ApiError(
      'VALIDATION_ERROR',
      `Действие "${dto.action}" неприменимо к задаче типа "${task.kind}"`,
      HttpStatus.BAD_REQUEST,
    );
  }
}

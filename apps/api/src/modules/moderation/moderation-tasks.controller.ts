import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import type { ModerationTask } from '@esim-detector/contracts';

import { AdminTokenGuard } from './admin-token.guard';
import { ListTasksQueryDto } from './dto/list-tasks-query.dto';
import { ResolveModerationTaskDto } from './dto/resolve-task.dto';
import { ModerationResolutionService, type ResolveOutcome } from './moderation-resolution.service';
import { ModerationTaskService, type ListModerationTasksResult } from './moderation-task.service';
import type {
  ModelCodeSuggestion,
  NameSuggestion,
  ScreenSignatureSuggestion,
} from './suggestions.service';
import { SuggestionsService } from './suggestions.service';

export interface TaskSuggestions {
  readonly modelCodes?: readonly ModelCodeSuggestion[];
  readonly screenSignatures?: readonly ScreenSignatureSuggestion[];
  readonly names?: readonly NameSuggestion[];
}

export interface TaskDetailResponse {
  readonly task: ModerationTask;
  readonly suggestions: TaskSuggestions;
}

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;

/**
 * `GET/POST /api/v1/admin/moderation/tasks*` (docs/15-moderation.md §15.8) — контроллер без
 * бизнес-логики (.cursor/rules/api-boundaries.mdc): разбор запроса, вызов сервисов, сборка
 * ответа. За `AdminTokenGuard` (ADR-025 п.5) на уровне контроллера — распространяется на все
 * маршруты класса.
 */
@Controller('admin/moderation/tasks')
@UseGuards(AdminTokenGuard)
export class ModerationTasksController {
  public constructor(
    private readonly taskService: ModerationTaskService,
    private readonly suggestionsService: SuggestionsService,
    private readonly resolutionService: ModerationResolutionService,
  ) {}

  @Get()
  public list(@Query() query: ListTasksQueryDto): Promise<ListModerationTasksResult> {
    return this.taskService.list({
      ...(query.kind !== undefined ? { kind: query.kind } : {}),
      ...(query.status !== undefined ? { status: query.status } : {}),
      page: query.page ?? DEFAULT_PAGE,
      pageSize: query.pageSize ?? DEFAULT_PAGE_SIZE,
    });
  }

  @Get(':id')
  public async getOne(@Param('id') id: string): Promise<TaskDetailResponse> {
    const task = await this.taskService.getByIdOrThrow(id);
    return { task, suggestions: this.buildSuggestions(task) };
  }

  @Post(':id/resolve')
  public resolve(
    @Param('id') id: string,
    @Body() body: ResolveModerationTaskDto,
  ): Promise<ResolveOutcome> {
    return this.resolutionService.resolve(id, body);
  }

  private buildSuggestions(task: ModerationTask): TaskSuggestions {
    if (task.kind === 'unknown_model_code') {
      return { modelCodes: this.suggestionsService.suggestByModelCode(task.payload.code) };
    }
    if (task.kind === 'unknown_screen_signature') {
      return {
        screenSignatures: this.suggestionsService.suggestByScreenSignature(
          task.payload.cssWidth,
          task.payload.cssHeight,
          task.payload.dpr,
        ),
      };
    }
    if (task.kind === 'unmatched_query' || task.kind === 'ambiguous_query') {
      return { names: this.suggestionsService.suggestByName(task.payload.rawQuery) };
    }
    if (task.kind === 'csv_quarantine' && task.payload.rawMarketingName !== undefined) {
      return { names: this.suggestionsService.suggestByName(task.payload.rawMarketingName) };
    }
    return {};
  }
}

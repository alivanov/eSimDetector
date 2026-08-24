import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import type { ModerationTask } from '@esim-detector/contracts';

import {
  apiErrorSchema,
  listTasksResponseSchema,
  resolveOutcomeSchema,
  taskDetailResponseSchema,
} from '../../common/swagger/response-schemas';

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
@ApiTags('admin')
@ApiSecurity('ADMIN_TOKEN')
@Controller('admin/moderation/tasks')
@UseGuards(AdminTokenGuard)
export class ModerationTasksController {
  public constructor(
    private readonly taskService: ModerationTaskService,
    private readonly suggestionsService: SuggestionsService,
    private readonly resolutionService: ModerationResolutionService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Очередь задач модерации' })
  @ApiQuery({
    name: 'kind',
    required: false,
    schema: {
      type: 'string',
      enum: [
        'unknown_model_code',
        'unknown_screen_signature',
        'unmatched_query',
        'ambiguous_query',
        'csv_quarantine',
        'source_disagreement',
        'user_feedback',
      ],
    },
  })
  @ApiQuery({
    name: 'status',
    required: false,
    schema: { type: 'string', enum: ['open', 'resolved', 'rejected'] },
  })
  @ApiQuery({
    name: 'page',
    required: false,
    schema: { type: 'integer', minimum: 1, default: 1 },
  })
  @ApiQuery({
    name: 'pageSize',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
  })
  @ApiResponse({
    status: 200,
    description: 'Страница задач',
    schema: listTasksResponseSchema,
  })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED', schema: apiErrorSchema })
  public list(@Query() query: ListTasksQueryDto): Promise<ListModerationTasksResult> {
    return this.taskService.list({
      ...(query.kind !== undefined ? { kind: query.kind } : {}),
      ...(query.status !== undefined ? { status: query.status } : {}),
      page: query.page ?? DEFAULT_PAGE,
      pageSize: query.pageSize ?? DEFAULT_PAGE_SIZE,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Задача модерации с автоматическими подсказками' })
  @ApiParam({
    name: 'id',
    description: '24-символьный hex-идентификатор задачи',
    schema: { type: 'string' },
  })
  @ApiResponse({
    status: 200,
    description: 'Задача и подсказки',
    schema: taskDetailResponseSchema,
  })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED', schema: apiErrorSchema })
  @ApiResponse({ status: 404, description: 'TASK_NOT_FOUND', schema: apiErrorSchema })
  public async getOne(@Param('id') id: string): Promise<TaskDetailResponse> {
    const task = await this.taskService.getByIdOrThrow(id);
    return { task, suggestions: this.buildSuggestions(task) };
  }

  @Post(':id/resolve')
  @ApiOperation({ summary: 'Применение решения по задаче модерации' })
  @ApiParam({
    name: 'id',
    description: '24-символьный hex-идентификатор задачи',
    schema: { type: 'string' },
  })
  @ApiResponse({
    status: 201,
    description: 'Исход решения',
    schema: resolveOutcomeSchema,
  })
  @ApiResponse({ status: 400, description: 'VALIDATION_ERROR', schema: apiErrorSchema })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED', schema: apiErrorSchema })
  @ApiResponse({ status: 404, description: 'TASK_NOT_FOUND', schema: apiErrorSchema })
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

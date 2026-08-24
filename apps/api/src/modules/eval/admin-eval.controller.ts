import { Controller, Get, HttpCode, HttpStatus, Param, Post, Res, UseGuards } from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';

import { apiErrorSchema } from '../../common/swagger/response-schemas';
import { AdminTokenGuard } from '../moderation/admin-token.guard';

import { EvalRunService, type EvalRunDto, type ListEvalRunsResult } from './eval-run.service';

/**
 * Группа `/api/v1/admin/eval/runs` (план «Админка и главная» §1.3) — запуск и скачивание
 * отчётов стенда оценки качества. За `AdminTokenGuard` (ADR-025 п.5).
 */
@ApiTags('admin')
@ApiSecurity('ADMIN_TOKEN')
@Controller('admin/eval/runs')
@UseGuards(AdminTokenGuard)
export class AdminEvalController {
  public constructor(private readonly evalRunService: EvalRunService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Запуск прогона стенда оценки качества' })
  @ApiResponse({ status: 201, description: 'Прогон создан и запущен в фоне' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED', schema: apiErrorSchema })
  @ApiResponse({ status: 409, description: 'EVAL_RUN_IN_PROGRESS', schema: apiErrorSchema })
  public start(): Promise<EvalRunDto> {
    return this.evalRunService.start();
  }

  @Get()
  @ApiOperation({ summary: 'Список прошлых прогонов стенда оценки' })
  @ApiResponse({ status: 200, description: 'Список прогонов' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED', schema: apiErrorSchema })
  public list(): Promise<ListEvalRunsResult> {
    return this.evalRunService.list();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Статус и прогресс прогона стенда оценки' })
  @ApiParam({ name: 'id', schema: { type: 'string' } })
  @ApiResponse({ status: 200, description: 'Карточка прогона' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED', schema: apiErrorSchema })
  @ApiResponse({ status: 404, description: 'EVAL_RUN_NOT_FOUND', schema: apiErrorSchema })
  public getById(@Param('id') id: string): Promise<EvalRunDto> {
    return this.evalRunService.getById(id);
  }

  @Get(':id/report')
  @ApiOperation({ summary: 'Скачать Markdown-отчёт прогона' })
  @ApiParam({ name: 'id', schema: { type: 'string' } })
  @ApiProduces('text/markdown')
  @ApiResponse({ status: 200, description: 'Markdown-отчёт' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED', schema: apiErrorSchema })
  @ApiResponse({ status: 404, description: 'EVAL_RUN_NOT_FOUND', schema: apiErrorSchema })
  @ApiResponse({ status: 409, description: 'EVAL_RUN_IN_PROGRESS', schema: apiErrorSchema })
  public async getReport(@Param('id') id: string, @Res() response: Response): Promise<void> {
    const markdown = await this.evalRunService.getReportMarkdown(id);
    response
      .status(HttpStatus.OK)
      .setHeader('Content-Type', 'text/markdown; charset=utf-8')
      .setHeader('Content-Disposition', `attachment; filename="eval-report-${id}.md"`)
      .send(markdown);
  }
}

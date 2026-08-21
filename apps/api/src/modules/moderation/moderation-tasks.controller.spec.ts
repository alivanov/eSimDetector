import type { ModerationTask } from '@esim-detector/contracts';

import { ModerationTasksController } from './moderation-tasks.controller';
import type { ListTasksQueryDto } from './dto/list-tasks-query.dto';
import type { ModerationResolutionService, ResolveOutcome } from './moderation-resolution.service';
import type { ListModerationTasksResult, ModerationTaskService } from './moderation-task.service';
import type { SuggestionsService } from './suggestions.service';

/**
 * `ModerationTasksController` — контроллер без бизнес-логики (.cursor/rules/api-boundaries.mdc):
 * разбор запроса, вызов сервисов с зависимостями-фейками (тот же приём, что и
 * `detection.controller.spec.ts`), сборка подсказок по `kind` задачи.
 */
describe('ModerationTasksController', () => {
  it('list передаёт фильтры и постраничные параметры с значениями по умолчанию', () => {
    const listResult: ListModerationTasksResult = { items: [], total: 0, page: 1, pageSize: 20 };
    const listSpy = jest.fn(() => Promise.resolve(listResult));
    const taskService: Pick<ModerationTaskService, 'list'> = { list: listSpy };
    const controller = new ModerationTasksController(
      taskService as ModerationTaskService,
      {} as SuggestionsService,
      {} as ModerationResolutionService,
    );

    const query: ListTasksQueryDto = { kind: 'unknown_model_code' };
    void controller.list(query);

    expect(listSpy).toHaveBeenCalledWith({ kind: 'unknown_model_code', page: 1, pageSize: 20 });
  });

  it('getOne строит подсказки по названию из payload.rawQuery для unmatched_query', async () => {
    const task: ModerationTask = {
      _id: 'task-1',
      kind: 'unmatched_query',
      key: 'iphone 20',
      payload: { rawQuery: 'айфон 20', normalizedQuery: 'iphone 20' },
      occurrences: 1,
      status: 'open',
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSeenAt: new Date(),
      resolvedAt: null,
      resolvedBy: null,
      resolutionNote: null,
    };
    const taskService: Pick<ModerationTaskService, 'getByIdOrThrow'> = {
      getByIdOrThrow: () => Promise.resolve(task),
    };
    const suggestByName = jest.fn(() => [
      { deviceId: 'apple-iphone-16', deviceName: 'iPhone 16', score: 0.4 },
    ]);
    const suggestionsService: Pick<SuggestionsService, 'suggestByName'> = { suggestByName };
    const controller = new ModerationTasksController(
      taskService as ModerationTaskService,
      suggestionsService as SuggestionsService,
      {} as ModerationResolutionService,
    );

    const result = await controller.getOne('task-1');

    expect(suggestByName).toHaveBeenCalledWith('айфон 20');
    expect(result.suggestions.names).toHaveLength(1);
  });

  function buildTaskCommon() {
    return {
      _id: 'task-1',
      occurrences: 1,
      status: 'open' as const,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSeenAt: new Date(),
      resolvedAt: null,
      resolvedBy: null,
      resolutionNote: null,
    };
  }

  it('getOne строит подсказки по коду модели для unknown_model_code', async () => {
    const task: ModerationTask = {
      ...buildTaskCommon(),
      kind: 'unknown_model_code',
      key: 'SM-S9280',
      payload: { code: 'SM-S9280', platform: 'android', brandGuess: 'samsung' },
    };
    const taskService: Pick<ModerationTaskService, 'getByIdOrThrow'> = {
      getByIdOrThrow: () => Promise.resolve(task),
    };
    const suggestByModelCode = jest.fn(() => []);
    const suggestionsService: Pick<SuggestionsService, 'suggestByModelCode'> = {
      suggestByModelCode,
    };
    const controller = new ModerationTasksController(
      taskService as ModerationTaskService,
      suggestionsService as SuggestionsService,
      {} as ModerationResolutionService,
    );

    const result = await controller.getOne('task-1');

    expect(suggestByModelCode).toHaveBeenCalledWith('SM-S9280');
    expect(result.suggestions.modelCodes).toEqual([]);
  });

  it('getOne строит подсказки по геометрии для unknown_screen_signature', async () => {
    const task: ModerationTask = {
      ...buildTaskCommon(),
      kind: 'unknown_screen_signature',
      key: '375x812@3@normal',
      payload: {
        signature: '375x812@3',
        cssWidth: 375,
        cssHeight: 812,
        dpr: 3,
        zoomed: false,
        osVersion: '17.5',
      },
    };
    const taskService: Pick<ModerationTaskService, 'getByIdOrThrow'> = {
      getByIdOrThrow: () => Promise.resolve(task),
    };
    const suggestByScreenSignature = jest.fn(() => []);
    const suggestionsService: Pick<SuggestionsService, 'suggestByScreenSignature'> = {
      suggestByScreenSignature,
    };
    const controller = new ModerationTasksController(
      taskService as ModerationTaskService,
      suggestionsService as SuggestionsService,
      {} as ModerationResolutionService,
    );

    const result = await controller.getOne('task-1');

    expect(suggestByScreenSignature).toHaveBeenCalledWith(375, 812, 3);
    expect(result.suggestions.screenSignatures).toEqual([]);
  });

  it('getOne строит подсказки по названию для csv_quarantine с rawMarketingName', async () => {
    const task: ModerationTask = {
      ...buildTaskCommon(),
      kind: 'csv_quarantine',
      key: 'CODE_COLLISION:gpt-5-6-luna:02:5',
      payload: {
        code: 'CODE_COLLISION',
        source: 'gpt-5-6-luna',
        batchId: '02',
        lineNumber: 5,
        detail: 'дублирующийся код',
        rawMarketingName: 'Galaxy Z Fold 6',
      },
    };
    const taskService: Pick<ModerationTaskService, 'getByIdOrThrow'> = {
      getByIdOrThrow: () => Promise.resolve(task),
    };
    const suggestByName = jest.fn(() => []);
    const suggestionsService: Pick<SuggestionsService, 'suggestByName'> = { suggestByName };
    const controller = new ModerationTasksController(
      taskService as ModerationTaskService,
      suggestionsService as SuggestionsService,
      {} as ModerationResolutionService,
    );

    const result = await controller.getOne('task-1');

    expect(suggestByName).toHaveBeenCalledWith('Galaxy Z Fold 6');
    expect(result.suggestions.names).toEqual([]);
  });

  it('getOne не строит подсказок для csv_quarantine без rawMarketingName и для source_disagreement/user_feedback', async () => {
    const quarantineTask: ModerationTask = {
      ...buildTaskCommon(),
      kind: 'csv_quarantine',
      key: 'FIELD_COUNT_MISMATCH:gpt-5-6-luna:02:9',
      payload: {
        code: 'FIELD_COUNT_MISMATCH',
        source: 'gpt-5-6-luna',
        batchId: '02',
        lineNumber: 9,
        detail: 'неверное число полей',
      },
    };
    const disagreementTask: ModerationTask = {
      ...buildTaskCommon(),
      kind: 'source_disagreement',
      key: 'samsung-galaxy-a54',
      payload: {
        deviceId: 'samsung-galaxy-a54',
        variants: [{ source: 'llm-model-a', esimSupport: 'yes' }],
      },
    };
    const feedbackTask: ModerationTask = {
      ...buildTaskCommon(),
      kind: 'user_feedback',
      key: 'req-1',
      payload: {
        requestId: 'req-1',
        reportedStatus: 'supported',
        deviceId: null,
        comment: 'неверно',
        signalsSummary: null,
      },
    };

    for (const task of [quarantineTask, disagreementTask, feedbackTask]) {
      const taskService: Pick<ModerationTaskService, 'getByIdOrThrow'> = {
        getByIdOrThrow: () => Promise.resolve(task),
      };
      const controller = new ModerationTasksController(
        taskService as ModerationTaskService,
        {} as SuggestionsService,
        {} as ModerationResolutionService,
      );

      const result = await controller.getOne('task-1');
      expect(result.suggestions).toEqual({});
    }
  });

  it('resolve делегирует в ModerationResolutionService.resolve', () => {
    const outcome: ResolveOutcome = { taskStatus: 'resolved' };
    const resolveSpy = jest.fn(() => Promise.resolve(outcome));
    const resolutionService: Pick<ModerationResolutionService, 'resolve'> = { resolve: resolveSpy };
    const controller = new ModerationTasksController(
      {} as ModerationTaskService,
      {} as SuggestionsService,
      resolutionService as ModerationResolutionService,
    );

    void controller.resolve('task-1', {
      action: 'reject',
      decidedBy: 'moderator-1',
      note: 'дубликат',
    });

    expect(resolveSpy).toHaveBeenCalledWith('task-1', {
      action: 'reject',
      decidedBy: 'moderator-1',
      note: 'дубликат',
    });
  });
});

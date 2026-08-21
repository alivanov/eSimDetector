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

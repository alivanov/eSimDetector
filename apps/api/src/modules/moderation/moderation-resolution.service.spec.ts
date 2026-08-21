import { buildSampleDevice, type ModerationTask } from '@esim-detector/contracts';

import type { CatalogWriteService } from './catalog-write.service';
import { ModerationResolutionService } from './moderation-resolution.service';
import type { ModerationTaskService } from './moderation-task.service';

const NOW = new Date('2026-08-20T00:00:00.000Z');

function buildTaskCommon() {
  return {
    _id: 'task-1',
    occurrences: 3,
    status: 'open' as const,
    createdAt: NOW,
    updatedAt: NOW,
    lastSeenAt: NOW,
    resolvedAt: null,
    resolvedBy: null,
    resolutionNote: null,
  };
}

function buildTaskService(task: ModerationTask): {
  service: ModerationTaskService;
  markResolved: jest.Mock;
  markRejected: jest.Mock;
} {
  const markResolved = jest.fn(() => Promise.resolve());
  const markRejected = jest.fn(() => Promise.resolve());
  const fake: Pick<ModerationTaskService, 'getByIdOrThrow' | 'markResolved' | 'markRejected'> = {
    getByIdOrThrow: () => Promise.resolve(task),
    markResolved,
    markRejected,
  };
  return { service: fake as ModerationTaskService, markResolved, markRejected };
}

function buildCatalogWriteService(): {
  service: CatalogWriteService;
  linkModelCode: jest.Mock;
  linkScreenSignature: jest.Mock;
  addAlias: jest.Mock;
  changeEsimStatus: jest.Mock;
} {
  const device = buildSampleDevice();
  const linkModelCode = jest.fn(() => Promise.resolve(device));
  const linkScreenSignature = jest.fn(() => Promise.resolve(device));
  const addAlias = jest.fn(() => Promise.resolve(device));
  const changeEsimStatus = jest.fn(() => Promise.resolve(device));
  const fake: Pick<
    CatalogWriteService,
    'linkModelCode' | 'linkScreenSignature' | 'addAlias' | 'changeEsimStatus'
  > = { linkModelCode, linkScreenSignature, addAlias, changeEsimStatus };
  return {
    service: fake as CatalogWriteService,
    linkModelCode,
    linkScreenSignature,
    addAlias,
    changeEsimStatus,
  };
}

/**
 * `ModerationResolutionService` (docs/15-moderation.md §15.4) — диспетчер «действие × тип
 * задачи»: проверяет допустимость сочетания и обязательные поля (`reason` для действий,
 * дающих `verified`, ADR-014), без обращения к реальной базе (зависимости — фейки).
 */
describe('ModerationResolutionService', () => {
  it('reject закрывает ЛЮБУЮ задачу без вызова CatalogWriteService', async () => {
    const task: ModerationTask = {
      ...buildTaskCommon(),
      kind: 'unknown_model_code',
      key: 'sm-s9280',
      payload: { code: 'SM-S9280', platform: 'android', brandGuess: null },
    };
    const { service: taskService, markRejected } = buildTaskService(task);
    const { service: catalogWriteService, linkModelCode } = buildCatalogWriteService();
    const resolution = new ModerationResolutionService(taskService, catalogWriteService);

    const outcome = await resolution.resolve('task-1', {
      action: 'reject',
      decidedBy: 'moderator-1',
      note: 'дубликат другой задачи',
    });

    expect(outcome.taskStatus).toBe('rejected');
    expect(linkModelCode).not.toHaveBeenCalled();
    expect(markRejected).toHaveBeenCalledWith('task-1', 'moderator-1', 'дубликат другой задачи');
  });

  it('link_model_code на задаче unknown_model_code вызывает CatalogWriteService.linkModelCode с кодом из payload', async () => {
    const task: ModerationTask = {
      ...buildTaskCommon(),
      kind: 'unknown_model_code',
      key: 'sm-s9280',
      payload: { code: 'SM-S9280', platform: 'android', brandGuess: 'samsung' },
    };
    const { service: taskService, markResolved } = buildTaskService(task);
    const { service: catalogWriteService, linkModelCode } = buildCatalogWriteService();
    const resolution = new ModerationResolutionService(taskService, catalogWriteService);

    const outcome = await resolution.resolve('task-1', {
      action: 'link_model_code',
      decidedBy: 'moderator-1',
      deviceId: 'samsung-galaxy-s24-ultra',
      reason: 'https://www.samsung.com/verified',
    });

    expect(outcome.taskStatus).toBe('resolved');
    expect(linkModelCode).toHaveBeenCalledWith(
      'samsung-galaxy-s24-ultra',
      'SM-S9280',
      'https://www.samsung.com/verified',
      'moderator-1',
      'task-1',
    );
    expect(markResolved).toHaveBeenCalled();
  });

  it('отклоняет действие, неприменимое к типу задачи, с VALIDATION_ERROR', async () => {
    const task: ModerationTask = {
      ...buildTaskCommon(),
      kind: 'unknown_model_code',
      key: 'sm-s9280',
      payload: { code: 'SM-S9280', platform: 'android', brandGuess: null },
    };
    const { service: taskService } = buildTaskService(task);
    const { service: catalogWriteService } = buildCatalogWriteService();
    const resolution = new ModerationResolutionService(taskService, catalogWriteService);

    await expect(
      resolution.resolve('task-1', {
        action: 'link_screen_signature',
        decidedBy: 'moderator-1',
        deviceId: 'apple-iphone-14-pro',
        reason: 'источник',
      }),
    ).rejects.toThrow('неприменимо');
  });

  it('требует reason для link_model_code — без него выбрасывает ошибку до вызова CatalogWriteService', async () => {
    const task: ModerationTask = {
      ...buildTaskCommon(),
      kind: 'unknown_model_code',
      key: 'sm-s9280',
      payload: { code: 'SM-S9280', platform: 'android', brandGuess: null },
    };
    const { service: taskService } = buildTaskService(task);
    const { service: catalogWriteService, linkModelCode } = buildCatalogWriteService();
    const resolution = new ModerationResolutionService(taskService, catalogWriteService);

    await expect(
      resolution.resolve('task-1', {
        action: 'link_model_code',
        decidedBy: 'moderator-1',
        deviceId: 'samsung-galaxy-s24-ultra',
      }),
    ).rejects.toThrow('reason');
    expect(linkModelCode).not.toHaveBeenCalled();
  });

  it('link_screen_signature на задаче unknown_screen_signature передаёт геометрию из payload', async () => {
    const task: ModerationTask = {
      ...buildTaskCommon(),
      kind: 'unknown_screen_signature',
      key: '375x813@3@normal',
      payload: {
        signature: '375x813@3',
        cssWidth: 375,
        cssHeight: 813,
        dpr: 3,
        zoomed: false,
        osVersion: '17.5',
      },
    };
    const { service: taskService, markResolved } = buildTaskService(task);
    const { service: catalogWriteService, linkScreenSignature } = buildCatalogWriteService();
    const resolution = new ModerationResolutionService(taskService, catalogWriteService);

    const outcome = await resolution.resolve('task-1', {
      action: 'link_screen_signature',
      decidedBy: 'moderator-1',
      deviceId: 'apple-iphone-13-mini',
      reason: 'https://support.apple.com/111845',
    });

    expect(outcome.taskStatus).toBe('resolved');
    expect(linkScreenSignature).toHaveBeenCalledWith(
      'apple-iphone-13-mini',
      { cssWidth: 375, cssHeight: 813, dpr: 3, zoomed: false },
      'https://support.apple.com/111845',
      'moderator-1',
      'task-1',
    );
    expect(markResolved).toHaveBeenCalled();
  });

  it('confirm_quarantine на csv_quarantine добавляет псевдоним из rawMarketingName', async () => {
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
    const { service: taskService } = buildTaskService(task);
    const { service: catalogWriteService, addAlias } = buildCatalogWriteService();
    const resolution = new ModerationResolutionService(taskService, catalogWriteService);

    const outcome = await resolution.resolve('task-1', {
      action: 'confirm_quarantine',
      decidedBy: 'moderator-1',
      deviceId: 'samsung-galaxy-z-fold-6',
      reason: 'https://www.samsung.com/galaxy-z-fold6',
    });

    expect(outcome.taskStatus).toBe('resolved');
    expect(addAlias).toHaveBeenCalledWith(
      'samsung-galaxy-z-fold-6',
      'Galaxy Z Fold 6',
      'https://www.samsung.com/galaxy-z-fold6',
      'moderator-1',
    );
  });

  it('reject_quarantine на csv_quarantine отклоняет задачу без изменения справочника', async () => {
    const task: ModerationTask = {
      ...buildTaskCommon(),
      kind: 'csv_quarantine',
      key: 'CODE_COLLISION:gpt-5-6-luna:02:5',
      payload: {
        code: 'CODE_COLLISION',
        source: 'gpt-5-6-luna',
        batchId: '02',
        lineNumber: 5,
        detail: 'x',
      },
    };
    const { service: taskService, markRejected } = buildTaskService(task);
    const { service: catalogWriteService, addAlias } = buildCatalogWriteService();
    const resolution = new ModerationResolutionService(taskService, catalogWriteService);

    const outcome = await resolution.resolve('task-1', {
      action: 'reject_quarantine',
      decidedBy: 'moderator-1',
      note: 'строка признана мусором',
    });

    expect(outcome.taskStatus).toBe('rejected');
    expect(addAlias).not.toHaveBeenCalled();
    expect(markRejected).toHaveBeenCalledWith('task-1', 'moderator-1', 'строка признана мусором');
  });

  it('acknowledge_feedback без deviceId/esimSupport просто закрывает задачу с комментарием', async () => {
    const task: ModerationTask = {
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
    const { service: taskService, markResolved } = buildTaskService(task);
    const { service: catalogWriteService, changeEsimStatus } = buildCatalogWriteService();
    const resolution = new ModerationResolutionService(taskService, catalogWriteService);

    const outcome = await resolution.resolve('task-1', {
      action: 'acknowledge_feedback',
      decidedBy: 'moderator-1',
      note: 'проверено, ошибка пользователя',
    });

    expect(outcome.taskStatus).toBe('resolved');
    expect(changeEsimStatus).not.toHaveBeenCalled();
    expect(markResolved).toHaveBeenCalledWith(
      'task-1',
      'moderator-1',
      'проверено, ошибка пользователя',
    );
  });

  it('acknowledge_feedback с deviceId и esimSupport меняет статус устройства', async () => {
    const task: ModerationTask = {
      ...buildTaskCommon(),
      kind: 'user_feedback',
      key: 'req-1',
      payload: {
        requestId: 'req-1',
        reportedStatus: 'not_supported',
        deviceId: 'samsung-galaxy-a54',
        comment: 'у меня eSIM есть',
        signalsSummary: null,
      },
    };
    const { service: taskService } = buildTaskService(task);
    const { service: catalogWriteService, changeEsimStatus } = buildCatalogWriteService();
    const resolution = new ModerationResolutionService(taskService, catalogWriteService);

    await resolution.resolve('task-1', {
      action: 'acknowledge_feedback',
      decidedBy: 'moderator-1',
      deviceId: 'samsung-galaxy-a54',
      esimSupport: 'supported',
      reason: 'https://www.samsung.com/verified',
      sourceUrl: 'https://www.samsung.com/verified',
    });

    expect(changeEsimStatus).toHaveBeenCalledWith(
      'samsung-galaxy-a54',
      { support: 'supported' },
      'verified',
      [
        {
          url: 'https://www.samsung.com/verified',
          title: 'Подтверждено модератором',
          checkedAt: expect.any(Date),
        },
      ],
      'https://www.samsung.com/verified',
      'moderator-1',
      'task-1',
    );
  });

  it('link_model_code на unmatched_query добавляет псевдоним из rawQuery, а не привязывает код', async () => {
    const task: ModerationTask = {
      ...buildTaskCommon(),
      kind: 'unmatched_query',
      key: 'iphone 20',
      payload: { rawQuery: 'айфон 20', normalizedQuery: 'iphone 20' },
    };
    const { service: taskService } = buildTaskService(task);
    const { service: catalogWriteService, addAlias } = buildCatalogWriteService();
    const resolution = new ModerationResolutionService(taskService, catalogWriteService);

    await resolution.resolve('task-1', {
      action: 'link_model_code',
      decidedBy: 'moderator-1',
      deviceId: 'apple-iphone-16',
      reason: 'частая опечатка пользователей',
    });

    expect(addAlias).toHaveBeenCalledWith(
      'apple-iphone-16',
      'айфон 20',
      'частая опечатка пользователей',
      'moderator-1',
    );
  });

  it('resolve_source_disagreement передаёт deviceId из payload задачи, а не из тела запроса', async () => {
    const task: ModerationTask = {
      ...buildTaskCommon(),
      kind: 'source_disagreement',
      key: 'samsung-galaxy-a54',
      payload: {
        deviceId: 'samsung-galaxy-a54',
        variants: [
          { source: 'llm-model-a', esimSupport: 'yes' },
          { source: 'llm-model-b', esimSupport: 'no' },
        ],
      },
    };
    const { service: taskService } = buildTaskService(task);
    const { service: catalogWriteService, changeEsimStatus } = buildCatalogWriteService();
    const resolution = new ModerationResolutionService(taskService, catalogWriteService);

    await resolution.resolve('task-1', {
      action: 'resolve_source_disagreement',
      decidedBy: 'moderator-1',
      esimSupport: 'supported',
      reason: 'https://www.samsung.com/verified',
      sourceUrl: 'https://www.samsung.com/verified',
    });

    expect(changeEsimStatus).toHaveBeenCalledWith(
      'samsung-galaxy-a54',
      { support: 'supported' },
      'verified',
      [
        {
          url: 'https://www.samsung.com/verified',
          title: 'Подтверждено модератором',
          checkedAt: expect.any(Date),
        },
      ],
      'https://www.samsung.com/verified',
      'moderator-1',
      'task-1',
    );
  });
});

import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { buildFakeResponse, installFetchMock } from '../debug/test-utils/fetch-mock';

import { AdminPage } from './AdminPage';
import { EvalTab } from './EvalTab';
import { HelpTab } from './HelpTab';
import { StatsTab } from './StatsTab';
import { TasksTab } from './TasksTab';
import { adminTexts, moderationTaskKindLabels } from './texts';

const session = { token: 'demo-admin-token', decidedBy: 'tester' };

const catalogStatsBody = {
  deviceCount: 100,
  updatedAt: '2026-08-20T00:00:00.000Z',
  openTaskCount: 19,
  screenSignatureCount: 50,
  byBrand: { samsung: 10 },
  byDataConfidence: { verified: 80 },
};

const completedEvalRun = {
  id: 'eval-run-1',
  status: 'completed',
  progress: { completed: 483, total: 483, phase: 'matching' },
  summary: {
    detectionFalsePositives: 0,
    matchingFalsePositives: 0,
    detectionTotal: 121,
    matchingTotal: 362,
    falsePositives: 0,
  },
  errorMessage: null,
  startedAt: '2026-08-24T10:00:00.000Z',
  finishedAt: '2026-08-24T10:05:00.000Z',
  createdAt: '2026-08-24T10:00:00.000Z',
  hasReport: true,
};

function installAdminFetchMock(options?: {
  readonly tasks?: readonly unknown[];
  readonly onReload?: () => void;
  readonly evalRuns?: readonly unknown[];
  readonly onStartEval?: () => unknown;
  readonly evalReportText?: string;
}): void {
  installFetchMock((url, _body, init) => {
    if (url.includes('/admin/catalog/stats')) {
      return Promise.resolve(buildFakeResponse({ body: catalogStatsBody }));
    }
    if (url.includes('/admin/catalog/reload')) {
      options?.onReload?.();
      return Promise.resolve(
        buildFakeResponse({ body: { deviceCount: 100, screenSignatureReady: true } }),
      );
    }
    if (url.includes('/admin/moderation/tasks')) {
      return Promise.resolve(
        buildFakeResponse({
          body: {
            items: options?.tasks ?? [],
            total: options?.tasks?.length ?? 0,
            page: 1,
            pageSize: 20,
          },
        }),
      );
    }
    if (url.includes('/admin/eval/runs') && url.endsWith('/report')) {
      return Promise.resolve(
        new Response(options?.evalReportText ?? '# отчёт\n', {
          status: 200,
          headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
        }),
      );
    }
    if (url.includes('/admin/eval/runs/') && !url.endsWith('/report')) {
      return Promise.resolve(buildFakeResponse({ body: completedEvalRun }));
    }
    if (url.includes('/admin/eval/runs')) {
      if (init?.method === 'POST') {
        const started = options?.onStartEval?.() ?? {
          ...completedEvalRun,
          id: 'eval-run-new',
          status: 'running',
          hasReport: false,
          summary: null,
          finishedAt: null,
          progress: { completed: 0, total: 483, phase: 'detection' },
        };
        return Promise.resolve(buildFakeResponse({ status: 201, body: started }));
      }
      return Promise.resolve(
        buildFakeResponse({ body: { items: options?.evalRuns ?? [completedEvalRun] } }),
      );
    }
    return Promise.resolve(buildFakeResponse({ status: 404, body: { error: { message: 'нет' } } }));
  });
}

describe('AdminPage', () => {
  it('показывает форму входа по токену, пока сессия не установлена (docs/15 §15.7, ADR-025 п.5)', () => {
    render(<AdminPage />);

    expect(screen.getByLabelText(adminTexts.tokenLabel)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: adminTexts.loginButton })).toBeInTheDocument();
    expect(screen.queryByText(adminTexts.tabQueue)).not.toBeInTheDocument();
  });

  it('после входа показывает вкладку «Справка» с разделами из плана §1.1', async () => {
    installAdminFetchMock();
    render(<AdminPage />);

    fireEvent.change(screen.getByLabelText(adminTexts.tokenLabel), {
      target: { value: 'demo-admin-token' },
    });
    fireEvent.click(screen.getByRole('button', { name: adminTexts.loginButton }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: adminTexts.tabHelp })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: adminTexts.tabHelp }));

    expect(screen.getByRole('heading', { name: adminTexts.helpQueueTitle })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: adminTexts.helpDevicesTitle })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: adminTexts.helpChangesTitle })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: adminTexts.helpStatsTitle })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: adminTexts.helpEvalTitle })).toBeInTheDocument();
    expect(screen.getByText(/SM-S9280/)).toBeInTheDocument();
  });

  it('после входа показывает вкладку «Стенд оценки»', async () => {
    installAdminFetchMock();
    render(<AdminPage />);

    fireEvent.change(screen.getByLabelText(adminTexts.tokenLabel), {
      target: { value: 'demo-admin-token' },
    });
    fireEvent.click(screen.getByRole('button', { name: adminTexts.loginButton }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: adminTexts.tabEval })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: adminTexts.tabEval }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: adminTexts.evalStartButton })).toBeInTheDocument();
    });
    expect(screen.getByText(adminTexts.evalHistoryTitle)).toBeInTheDocument();
  });
});

describe('HelpTab', () => {
  it('не ссылается на файлы docs/* и не требует seed после обычной модерации', () => {
    render(<HelpTab />);
    expect(screen.queryByText(/docs\//)).not.toBeInTheDocument();
    expect(screen.getByText(adminTexts.helpStats)).toBeInTheDocument();
    expect(adminTexts.helpStats).toMatch(/не после обычной модерации/);
    expect(adminTexts.helpIntro).toMatch(/verified/);
  });
});

describe('TasksTab', () => {
  it('показывает типы задач по-русски и колонку «Когда» с lastSeenAt', async () => {
    installAdminFetchMock({
      tasks: [
        {
          _id: 'task-1',
          kind: 'unknown_model_code',
          key: 'sm-s9280',
          payload: { code: 'SM-S9280', platform: 'android', brandGuess: 'samsung' },
          occurrences: 3,
          status: 'open',
          createdAt: '2026-08-20T10:00:00.000Z',
          updatedAt: '2026-08-20T12:00:00.000Z',
          lastSeenAt: '2026-08-20T12:00:00.000Z',
          resolvedAt: null,
          resolvedBy: null,
          resolutionNote: null,
        },
        {
          _id: 'task-2',
          kind: 'ambiguous_query',
          key: 'iphone-12',
          payload: {
            rawQuery: 'айфон 12',
            normalizedQuery: 'iphone 12',
            candidateIds: ['apple-iphone-12'],
          },
          occurrences: 51,
          status: 'open',
          createdAt: '2026-08-20T10:00:00.000Z',
          updatedAt: '2026-08-24T09:07:10.645Z',
          lastSeenAt: '2026-08-24T09:07:10.645Z',
          resolvedAt: null,
          resolvedBy: null,
          resolutionNote: null,
        },
      ],
    });

    render(<TasksTab session={session} />);

    await waitFor(() => {
      expect(screen.getByText('айфон 12')).toBeInTheDocument();
    });

    expect(
      screen.getAllByText(moderationTaskKindLabels.unknown_model_code).length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByText(moderationTaskKindLabels.ambiguous_query).length,
    ).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('unknown_model_code')).not.toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: adminTexts.queueWhenColumn }),
    ).toBeInTheDocument();

    const expectedWhen = new Date('2026-08-24T09:07:10.645Z').toLocaleString('ru-RU');
    expect(screen.getByText(expectedWhen)).toBeInTheDocument();
  });
});

describe('StatsTab', () => {
  it('показывает инструкцию про seed и спрашивает подтверждение перед перечитыванием кэша', async () => {
    let reloadCalled = false;
    installAdminFetchMock({
      onReload: () => {
        reloadCalled = true;
      },
    });
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false);

    render(<StatsTab session={session} />);

    await waitFor(() => {
      expect(screen.getByText(adminTexts.statsSeedTitle)).toBeInTheDocument();
    });
    expect(screen.getByText(adminTexts.statsSeedBody)).toBeInTheDocument();
    expect(adminTexts.statsSeedBody).toMatch(/не нужны/);
    expect(adminTexts.statsSeedBody).toMatch(/массового переимпорта CSV/);

    fireEvent.click(screen.getByRole('button', { name: adminTexts.reloadButton }));
    expect(confirmSpy).toHaveBeenCalledWith(adminTexts.reloadConfirm);
    expect(reloadCalled).toBe(false);

    confirmSpy.mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: adminTexts.reloadButton }));
    await waitFor(() => {
      expect(reloadCalled).toBe(true);
    });
    await waitFor(() => {
      expect(screen.getByText(/Кэш перечитан/)).toBeInTheDocument();
    });

    confirmSpy.mockRestore();
  });
});

describe('EvalTab', () => {
  it('спрашивает подтверждение перед запуском и показывает прошлые прогоны', async () => {
    let started = false;
    installAdminFetchMock({
      evalRuns: [completedEvalRun],
      onStartEval: () => {
        started = true;
        return {
          ...completedEvalRun,
          id: 'eval-run-new',
          status: 'running',
          hasReport: false,
          summary: null,
          finishedAt: null,
          progress: { completed: 10, total: 483, phase: 'detection' },
        };
      },
    });
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false);

    render(<EvalTab session={session} />);

    await waitFor(() => {
      expect(screen.getByText(adminTexts.evalHistoryTitle)).toBeInTheDocument();
    });
    expect(screen.getByText(adminTexts.evalStatusCompleted)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: adminTexts.evalDownloadReport })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: adminTexts.evalStartButton }));
    expect(confirmSpy).toHaveBeenCalledWith(adminTexts.evalStartConfirm);
    expect(started).toBe(false);

    confirmSpy.mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: adminTexts.evalStartButton }));
    await waitFor(() => {
      expect(started).toBe(true);
    });
    await waitFor(() => {
      expect(screen.getByText(adminTexts.evalStatusRunning)).toBeInTheDocument();
    });

    confirmSpy.mockRestore();
  });
});

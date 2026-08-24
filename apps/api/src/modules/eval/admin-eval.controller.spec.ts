import { AdminEvalController } from './admin-eval.controller';
import type { EvalRunService } from './eval-run.service';

describe('AdminEvalController', () => {
  it('делегирует start/list/getById в EvalRunService', async () => {
    const dto = {
      id: '1',
      status: 'running' as const,
      progress: { completed: 0, total: 0, phase: null },
      summary: null,
      errorMessage: null,
      startedAt: '2026-08-24T00:00:00.000Z',
      finishedAt: null,
      createdAt: '2026-08-24T00:00:00.000Z',
      hasReport: false,
    };
    const start = jest.fn(() => Promise.resolve(dto));
    const list = jest.fn(() => Promise.resolve({ items: [dto] }));
    const getById = jest.fn(() => Promise.resolve(dto));
    const controller = new AdminEvalController({
      start,
      list,
      getById,
      getReportMarkdown: jest.fn(),
    } as unknown as EvalRunService);

    await expect(controller.start()).resolves.toBe(dto);
    expect(start).toHaveBeenCalled();
    await expect(controller.list()).resolves.toEqual({ items: [dto] });
    await expect(controller.getById('1')).resolves.toBe(dto);
    expect(getById).toHaveBeenCalledWith('1');
  });
});

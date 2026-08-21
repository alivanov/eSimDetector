import { parseCatalogChangeEntry } from './catalog-change.schema';

describe('catalogChangeEntrySchema', () => {
  it('разбирает запись с привязкой устройства и задачи', () => {
    const entry = parseCatalogChangeEntry({
      _id: 'change-1',
      deviceId: 'samsung-galaxy-s24-ultra',
      taskId: 'task-1',
      action: 'link_model_code',
      field: 'modelCodes',
      previousValue: ['SM-S928B'],
      newValue: ['SM-S928B', 'SM-S9280'],
      reason: 'https://example.com/vendor-page',
      decidedBy: 'moderator-1',
      createdAt: new Date('2024-01-01'),
    });

    expect(entry.action).toBe('link_model_code');
  });

  it('разбирает запись без deviceId (отклонение задачи)', () => {
    const entry = parseCatalogChangeEntry({
      _id: 'change-2',
      deviceId: null,
      taskId: 'task-2',
      action: 'reject_task',
      field: null,
      previousValue: null,
      newValue: null,
      reason: 'дубликат другой задачи',
      decidedBy: 'moderator-1',
      createdAt: new Date('2024-01-01'),
    });

    expect(entry.deviceId).toBeNull();
  });
});

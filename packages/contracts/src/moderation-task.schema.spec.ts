import { parseModerationTask } from './moderation-task.schema';

function buildCommon() {
  return {
    _id: 'task-1',
    occurrences: 1,
    status: 'open' as const,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    lastSeenAt: new Date('2024-01-01'),
    resolvedAt: null,
    resolvedBy: null,
    resolutionNote: null,
  };
}

describe('moderationTaskSchema', () => {
  it('разбирает задачу unknown_model_code с брендом, распознанным по шаблону', () => {
    const task = parseModerationTask({
      ...buildCommon(),
      kind: 'unknown_model_code',
      key: 'sm-s9280',
      payload: { code: 'SM-S9280', platform: 'android', brandGuess: 'samsung' },
    });

    expect(task.kind).toBe('unknown_model_code');
    if (task.kind === 'unknown_model_code') {
      expect(task.payload.brandGuess).toBe('samsung');
    }
  });

  it('разбирает задачу unknown_screen_signature', () => {
    const task = parseModerationTask({
      ...buildCommon(),
      kind: 'unknown_screen_signature',
      key: '393x852@3@normal',
      payload: {
        signature: '393x852@3',
        cssWidth: 393,
        cssHeight: 852,
        dpr: 3,
        zoomed: false,
        osVersion: '18.5',
      },
    });

    expect(task.kind).toBe('unknown_screen_signature');
  });

  it('отклоняет payload не своего kind (защита дискриминированным объединением)', () => {
    expect(() =>
      parseModerationTask({
        ...buildCommon(),
        kind: 'unknown_model_code',
        key: 'x',
        payload: { rawQuery: 'айфон', normalizedQuery: 'iphone' },
      }),
    ).toThrow();
  });

  it('разбирает задачу user_feedback', () => {
    const task = parseModerationTask({
      ...buildCommon(),
      kind: 'user_feedback',
      key: 'req-1',
      payload: {
        requestId: 'req-1',
        reportedStatus: 'supported',
        deviceId: 'apple-iphone-13',
        comment: 'На самом деле у меня нет eSIM',
        signalsSummary: null,
      },
    });

    expect(task.kind).toBe('user_feedback');
  });
});

import { userFeedbackPayloadSchema } from '@esim-detector/contracts';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import type { ModerationTaskService } from '../moderation/moderation-task.service';

import { FeedbackController } from './feedback.controller';
import { FeedbackRequestDto } from './dto/feedback-request.dto';

/**
 * `POST /api/v1/feedback` (docs/06 §6.4, docs/15-moderation.md §15.2) — эндпоинт ПУБЛИЧНЫЙ, поэтому
 * его граница проверяется отдельно от контроллера: любое поле, которое `userFeedbackPayloadSchema`
 * требует непустым, обязано быть отклонено здесь. Иначе анонимный клиент создаёт задачу, которую
 * очередь не может прочитать (docs/09-decisions.md ADR-044).
 */
describe('FeedbackController', () => {
  it('заводит задачу user_feedback и отвечает "принято"', async () => {
    const recordUserFeedback = jest.fn(() => Promise.resolve());
    const taskService: Pick<ModerationTaskService, 'recordUserFeedback'> = { recordUserFeedback };
    const controller = new FeedbackController(taskService as ModerationTaskService);

    const response = await controller.submit({
      requestId: 'req-1',
      reportedStatus: 'supported',
      comment: 'у меня eSIM не работает',
    });

    expect(response).toEqual({ requestId: 'req-1', received: true });
    expect(recordUserFeedback).toHaveBeenCalledWith({
      requestId: 'req-1',
      reportedStatus: 'supported',
      deviceId: null,
      comment: 'у меня eSIM не работает',
      signalsSummary: null,
    });
  });

  it.each([
    ['comment', { requestId: 'req-1', reportedStatus: 'supported', comment: '' }],
    ['requestId', { requestId: '', reportedStatus: 'supported', comment: 'текст' }],
    [
      'deviceId',
      { requestId: 'req-1', reportedStatus: 'supported', comment: 'текст', deviceId: '' },
    ],
  ])('отклоняет пустое поле "%s" на границе, а не при чтении очереди', async (_field, body) => {
    const errors = await validate(plainToInstance(FeedbackRequestDto, body));

    expect(errors.length).toBeGreaterThan(0);
  });

  it('поля, обязательные для схемы задачи, совпадают с проверяемыми на границе', () => {
    // Тест-страховка от расхождения двух списков: если схема задачи начнёт требовать непустым
    // ещё одно поле, а DTO — нет, документ снова станет незаписываемым-непрочитываемым.
    const parsed = userFeedbackPayloadSchema.safeParse({
      requestId: '',
      reportedStatus: 'supported',
      deviceId: '',
      comment: '',
      signalsSummary: null,
    });

    expect(parsed.success).toBe(false);
    const failedFields = parsed.success
      ? []
      : parsed.error.issues.map((issue) => issue.path.join('.')).sort();
    expect(failedFields).toEqual(['comment', 'deviceId', 'requestId']);
  });
});

import type { Request } from 'express';

import { DetectionController } from './detection.controller';
import type { DetectRequestDto } from './dto/detect-request.dto';
import type { DetectionService } from './detection.service';
import type { DetectResult } from './detection.service';

function buildFakeRequest(headers: Record<string, string | string[]>): Request {
  const fake: Pick<Request, 'headers'> = { headers };
  return fake as Request;
}

describe('DetectionController', () => {
  const sampleResult: DetectResult = {
    status: 'clarification_required',
    confidence: 0,
    detection: {
      method: 'unknown',
      platform: 'other',
      exactModelKnown: false,
      deviceType: 'phone',
    },
    device: null,
    candidates: [],
    reasons: [{ code: 'NO_SIGNALS' }],
    presentation: {
      title: 'Нужно уточнить модель устройства',
      description: 'нет данных',
      primaryAction: { label: 'Выбрать модель', kind: 'clarify' },
    },
  };

  it('вызывает DetectionService.detect с сигналами тела и добавляет requestId в ответ', () => {
    const detectSpy = jest.fn().mockReturnValue(sampleResult);
    const fakeService: Pick<DetectionService, 'detect'> = { detect: detectSpy };
    const controller = new DetectionController(fakeService as DetectionService);

    const body: DetectRequestDto = { signals: { userAgent: 'test-ua' } };
    const req = buildFakeRequest({ 'x-request-id': 'req-1' });

    const response = controller.detect(body, req);

    expect(detectSpy).toHaveBeenCalledWith(body.signals, {}, 'unknown', undefined);
    expect(response).toEqual({ requestId: 'unknown', ...sampleResult });
  });

  it('передаёт context.region сервису — только явный ответ пользователя, не выводится из locale', () => {
    const detectSpy = jest.fn().mockReturnValue(sampleResult);
    const fakeService: Pick<DetectionService, 'detect'> = { detect: detectSpy };
    const controller = new DetectionController(fakeService as DetectionService);

    const body: DetectRequestDto = {
      signals: { userAgent: 'test-ua' },
      context: { region: 'CN', locale: 'ru-RU' },
    };
    const req = buildFakeRequest({});

    controller.detect(body, req);

    expect(detectSpy).toHaveBeenCalledWith(body.signals, {}, 'unknown', 'CN');
  });

  it('снимает кавычки со значений заголовков Sec-CH-UA-* перед передачей в сервис', () => {
    const detectSpy = jest.fn().mockReturnValue(sampleResult);
    const fakeService: Pick<DetectionService, 'detect'> = { detect: detectSpy };
    const controller = new DetectionController(fakeService as DetectionService);

    const req = buildFakeRequest({
      'sec-ch-ua-model': '"SM-S928B"',
      'sec-ch-ua-platform': '"Android"',
    });

    controller.detect({}, req);

    expect(detectSpy).toHaveBeenCalledWith(
      undefined,
      { model: 'SM-S928B', platform: 'Android' },
      'unknown',
      undefined,
    );
  });

  it('берёт первое значение, если заголовок пришёл как массив строк', () => {
    const detectSpy = jest.fn().mockReturnValue(sampleResult);
    const fakeService: Pick<DetectionService, 'detect'> = { detect: detectSpy };
    const controller = new DetectionController(fakeService as DetectionService);

    const req = buildFakeRequest({ 'sec-ch-ua-model': ['SM-S928B', 'SM-A556E'] });

    controller.detect({}, req);

    expect(detectSpy).toHaveBeenCalledWith(undefined, { model: 'SM-S928B' }, 'unknown', undefined);
  });
});

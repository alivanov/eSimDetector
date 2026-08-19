import type { Request } from 'express';

import { MatchingController } from './matching.controller';
import type { MatchingService, SearchResult, SuggestResult } from './matching.service';

function buildFakeRequest(): Request {
  const fake: Pick<Request, 'headers'> = { headers: {} };
  return fake as Request;
}

describe('MatchingController', () => {
  const sampleSearchResult: SearchResult = {
    query: { raw: 'iphone 15', normalized: 'iphone 15' },
    status: 'supported',
    confidence: 0.9,
    device: null,
    matches: [],
    reasons: [],
    presentation: { title: 'Ваше устройство поддерживает eSIM', description: '...' },
  };

  const sampleSuggestResult: SuggestResult = {
    query: { raw: 'iph', normalized: 'iph' },
    suggestions: [{ id: 'apple-iphone-15', name: 'iPhone 15', brand: 'Apple' }],
  };

  it('searchByQuery вызывает MatchingService.search и добавляет requestId', () => {
    const searchSpy = jest.fn().mockReturnValue(sampleSearchResult);
    const fakeService: Pick<MatchingService, 'search'> = { search: searchSpy };
    const controller = new MatchingController(fakeService as MatchingService);

    const response = controller.searchByQuery({ q: 'iphone 15' }, buildFakeRequest());

    expect(searchSpy).toHaveBeenCalledWith('iphone 15', undefined);
    expect(response).toEqual({ requestId: 'unknown', ...sampleSearchResult });
  });

  it('searchByQuery передаёт region — только явный ответ пользователя, без вывода из locale', () => {
    const searchSpy = jest.fn().mockReturnValue(sampleSearchResult);
    const fakeService: Pick<MatchingService, 'search'> = { search: searchSpy };
    const controller = new MatchingController(fakeService as MatchingService);

    controller.searchByQuery({ q: 'iphone 15', region: 'CN' }, buildFakeRequest());

    expect(searchSpy).toHaveBeenCalledWith('iphone 15', 'CN');
  });

  it('searchByBody вызывает MatchingService.search с q из тела запроса', () => {
    const searchSpy = jest.fn().mockReturnValue(sampleSearchResult);
    const fakeService: Pick<MatchingService, 'search'> = { search: searchSpy };
    const controller = new MatchingController(fakeService as MatchingService);

    controller.searchByBody({ q: 'iphone 15' }, buildFakeRequest());

    expect(searchSpy).toHaveBeenCalledWith('iphone 15', undefined);
  });

  it('searchByBody передаёт region из тела POST-запроса (ADR-024 п.6: тот же контракт, что и GET)', () => {
    const searchSpy = jest.fn().mockReturnValue(sampleSearchResult);
    const fakeService: Pick<MatchingService, 'search'> = { search: searchSpy };
    const controller = new MatchingController(fakeService as MatchingService);

    controller.searchByBody({ q: 'iphone 15', region: 'RU' }, buildFakeRequest());

    expect(searchSpy).toHaveBeenCalledWith('iphone 15', 'RU');
  });

  it('suggest вызывает MatchingService.suggest с q и limit', () => {
    const suggestSpy = jest.fn().mockReturnValue(sampleSuggestResult);
    const fakeService: Pick<MatchingService, 'suggest'> = { suggest: suggestSpy };
    const controller = new MatchingController(fakeService as MatchingService);

    const response = controller.suggest({ q: 'iph', limit: 5 }, buildFakeRequest());

    expect(suggestSpy).toHaveBeenCalledWith('iph', 5);
    expect(response).toEqual({ requestId: 'unknown', ...sampleSuggestResult });
  });
});

import type { Request } from 'express';

import type { DeviceCard } from '../../common/response';

import type { DeviceCatalogQueryService, ListDevicesResult } from './device-catalog-query.service';
import { MatchingController } from './matching.controller';
import type { MatchingService, SearchResult, SuggestResult } from './matching.service';

function buildFakeRequest(): Request {
  const fake: Pick<Request, 'headers'> = { headers: {} };
  return fake as Request;
}

function buildFakeDeviceCatalogQueryService(): DeviceCatalogQueryService {
  const fake: Pick<DeviceCatalogQueryService, 'getByIdOrThrow' | 'list' | 'listBrands'> = {
    getByIdOrThrow: jest.fn(),
    list: jest.fn(),
    listBrands: jest.fn(),
  };
  return fake as DeviceCatalogQueryService;
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
    const controller = new MatchingController(
      fakeService as MatchingService,
      buildFakeDeviceCatalogQueryService(),
    );

    const response = controller.searchByQuery({ q: 'iphone 15' }, buildFakeRequest());

    expect(searchSpy).toHaveBeenCalledWith('iphone 15', undefined);
    expect(response).toEqual({ requestId: 'unknown', ...sampleSearchResult });
  });

  it('searchByQuery передаёт region — только явный ответ пользователя, без вывода из locale', () => {
    const searchSpy = jest.fn().mockReturnValue(sampleSearchResult);
    const fakeService: Pick<MatchingService, 'search'> = { search: searchSpy };
    const controller = new MatchingController(
      fakeService as MatchingService,
      buildFakeDeviceCatalogQueryService(),
    );

    controller.searchByQuery({ q: 'iphone 15', region: 'CN' }, buildFakeRequest());

    expect(searchSpy).toHaveBeenCalledWith('iphone 15', 'CN');
  });

  it('searchByBody вызывает MatchingService.search с q из тела запроса', () => {
    const searchSpy = jest.fn().mockReturnValue(sampleSearchResult);
    const fakeService: Pick<MatchingService, 'search'> = { search: searchSpy };
    const controller = new MatchingController(
      fakeService as MatchingService,
      buildFakeDeviceCatalogQueryService(),
    );

    controller.searchByBody({ q: 'iphone 15' }, buildFakeRequest());

    expect(searchSpy).toHaveBeenCalledWith('iphone 15', undefined);
  });

  it('searchByBody передаёт region из тела POST-запроса (ADR-024 п.6: тот же контракт, что и GET)', () => {
    const searchSpy = jest.fn().mockReturnValue(sampleSearchResult);
    const fakeService: Pick<MatchingService, 'search'> = { search: searchSpy };
    const controller = new MatchingController(
      fakeService as MatchingService,
      buildFakeDeviceCatalogQueryService(),
    );

    controller.searchByBody({ q: 'iphone 15', region: 'RU' }, buildFakeRequest());

    expect(searchSpy).toHaveBeenCalledWith('iphone 15', 'RU');
  });

  it('suggest вызывает MatchingService.suggest с q и limit', () => {
    const suggestSpy = jest.fn().mockReturnValue(sampleSuggestResult);
    const fakeService: Pick<MatchingService, 'suggest'> = { suggest: suggestSpy };
    const controller = new MatchingController(
      fakeService as MatchingService,
      buildFakeDeviceCatalogQueryService(),
    );

    const response = controller.suggest({ q: 'iph', limit: 5 }, buildFakeRequest());

    expect(suggestSpy).toHaveBeenCalledWith('iph', 5);
    expect(response).toEqual({ requestId: 'unknown', ...sampleSuggestResult });
  });

  it('getById делегирует DeviceCatalogQueryService.getByIdOrThrow (docs/06 §6.4)', () => {
    const card: DeviceCard = {
      id: 'apple-iphone-15',
      brand: 'Apple',
      brandTitle: 'Apple',
      marketingName: 'iPhone 15',
      name: 'Apple iPhone 15',
      family: 'iphone',
      generation: 15,
      modifiers: [],
      modelCodes: [],
      platform: 'ios',
      deviceType: 'phone',
      esim: {
        support: 'supported',
        dualSim: 'physical+esim',
        maxProfiles: 8,
        conditions: [],
        clarifyingQuestion: null,
        notes: '',
      },
      releaseYear: 2023,
      sources: [],
      dataConfidence: 'verified',
    };
    const getByIdOrThrow = jest.fn().mockReturnValue(card);
    const fakeDeviceQuery: Pick<DeviceCatalogQueryService, 'getByIdOrThrow'> = { getByIdOrThrow };
    const controller = new MatchingController(
      {} as MatchingService,
      fakeDeviceQuery as DeviceCatalogQueryService,
    );

    expect(controller.getById('apple-iphone-15')).toBe(card);
    expect(getByIdOrThrow).toHaveBeenCalledWith('apple-iphone-15');
  });

  it('list делегирует DeviceCatalogQueryService.list с параметрами по умолчанию', () => {
    const result: ListDevicesResult = { items: [], total: 0, page: 1, pageSize: 20 };
    const list = jest.fn().mockReturnValue(result);
    const fakeDeviceQuery: Pick<DeviceCatalogQueryService, 'list'> = { list };
    const controller = new MatchingController(
      {} as MatchingService,
      fakeDeviceQuery as DeviceCatalogQueryService,
    );

    expect(controller.list({})).toBe(result);
    expect(list).toHaveBeenCalledWith({ page: 1, pageSize: 20 });
  });

  it('list передаёт brand/platform/page/pageSize из query', () => {
    const result: ListDevicesResult = { items: [], total: 0, page: 2, pageSize: 10 };
    const list = jest.fn().mockReturnValue(result);
    const fakeDeviceQuery: Pick<DeviceCatalogQueryService, 'list'> = { list };
    const controller = new MatchingController(
      {} as MatchingService,
      fakeDeviceQuery as DeviceCatalogQueryService,
    );

    controller.list({ brand: 'samsung', platform: 'android', page: 2, pageSize: 10 });

    expect(list).toHaveBeenCalledWith({
      brand: 'samsung',
      platform: 'android',
      page: 2,
      pageSize: 10,
    });
  });
});

import type { CreateDeviceDto } from './dto/create-device.dto';
import { buildDeviceFromDto } from './build-device-from-dto';

const NOW = new Date('2026-08-20T00:00:00.000Z');

const BASE_DTO: CreateDeviceDto = {
  id: 'xiaomi-poco-x7-pro',
  brand: 'xiaomi',
  brandTitle: 'POCO',
  marketingName: 'X7 Pro',
  family: 'poco-x',
  platform: 'android',
  deviceType: 'phone',
  esimSupport: 'supported',
  releaseYear: 2025,
  decidedBy: 'moderator-1',
  reason: 'создано вручную по данным вендора',
  sources: [{ url: 'https://www.mi.com/poco-x7-pro', title: 'POCO' }],
};

const DTO_WITHOUT_SOURCE: CreateDeviceDto = {
  id: 'xiaomi-poco-x7-pro',
  brand: 'xiaomi',
  brandTitle: 'POCO',
  marketingName: 'X7 Pro',
  family: 'poco-x',
  platform: 'android',
  deviceType: 'phone',
  esimSupport: 'supported',
  releaseYear: 2025,
  decidedBy: 'moderator-1',
  reason: 'создано вручную по данным вендора',
};

/**
 * `buildDeviceFromDto` (docs/15-moderation.md §15.4: «Создать запись устройства; поле со ссылкой
 * на источник обязательно для статуса "поддерживает"») — функция без побочных эффектов.
 */
describe('buildDeviceFromDto', () => {
  it('собирает верифицированную запись при наличии источника и статусе "поддерживает"', () => {
    const device = buildDeviceFromDto(BASE_DTO, NOW);

    expect(device._id).toBe('xiaomi-poco-x7-pro');
    expect(device.dataConfidence).toBe('verified');
    expect(device.esim.support).toBe('supported');
    expect(device.esim.dualSim).toBe('physical+esim');
    expect(device.provenance.source).toBe('moderator:moderator-1');
    expect(device.displayName).toBe('POCO X7 Pro');
    expect(device.aliases).toContain('poco x7 pro');
  });

  it('бросает VALIDATION_ERROR, если статус "поддерживает" заявлен без источника', () => {
    expect(() => buildDeviceFromDto(DTO_WITHOUT_SOURCE, NOW)).toThrow('источник');
  });

  it('без источника допускает статус "не поддерживает" — уровень derived', () => {
    const device = buildDeviceFromDto({ ...DTO_WITHOUT_SOURCE, esimSupport: 'not_supported' }, NOW);

    expect(device.dataConfidence).toBe('derived');
    expect(device.esim.dualSim).toBe('none');
  });

  it('заполняет опциональные поля значениями по умолчанию, когда они не заданы', () => {
    const device = buildDeviceFromDto(BASE_DTO, NOW);

    expect(device.modelCodes).toEqual([]);
    expect(device.modifiers).toEqual([]);
    expect(device.generation).toBeNull();
    expect(device.popularity).toBe(0.5);
  });
});

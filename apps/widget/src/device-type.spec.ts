import { findDeviceTypeLabel, findDeviceTypeNotice } from './device-type';

describe('findDeviceTypeNotice', () => {
  it('находит текст по коду DEVICE_TYPE_WATCH_DETECTED', () => {
    expect(findDeviceTypeNotice([{ code: 'DEVICE_TYPE_WATCH_DETECTED' }])).toBe(
      'Вы открыли страницу на умных часах. Найдите модель часов по названию.',
    );
  });

  it('находит текст по коду DEVICE_TYPE_AMBIGUOUS среди прочих кодов', () => {
    expect(
      findDeviceTypeNotice([{ code: 'PLATFORM_DETECTED' }, { code: 'DEVICE_TYPE_AMBIGUOUS' }]),
    ).toBe(
      'Не удалось отличить iPad от компьютера Mac по данным браузера. Укажите устройство вручную.',
    );
  });

  it('находит текст по коду PLATFORM_NOT_MOBILE', () => {
    expect(findDeviceTypeNotice([{ code: 'PLATFORM_NOT_MOBILE' }])).toBe(
      'Похоже, вы на компьютере. Укажите телефон или планшет вручную.',
    );
  });

  it('undefined, если среди причин нет адресного кода типа устройства', () => {
    expect(findDeviceTypeNotice([{ code: 'CATALOG_EXACT_MATCH' }])).toBeUndefined();
    expect(findDeviceTypeNotice([])).toBeUndefined();
  });
});

describe('findDeviceTypeLabel', () => {
  it('метки для tablet/watch/phone', () => {
    expect(findDeviceTypeLabel('tablet')).toBe('Планшет');
    expect(findDeviceTypeLabel('watch')).toBe('Умные часы');
    expect(findDeviceTypeLabel('phone')).toBe('Телефон');
  });

  it('нет утверждённого текста для laptop/other', () => {
    expect(findDeviceTypeLabel('laptop')).toBeUndefined();
    expect(findDeviceTypeLabel('other')).toBeUndefined();
  });
});

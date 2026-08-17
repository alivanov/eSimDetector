import type { MatcherDevice } from './types';
import { buildAliasIndex, lookupAlias, lookupModelCode } from './exact-index';

function buildDevice(overrides: Partial<MatcherDevice> = {}): MatcherDevice {
  return {
    id: 'apple-iphone-15-pro',
    brand: 'apple',
    family: 'iphone',
    generation: 15,
    modifiers: ['pro'],
    modelCodes: [],
    aliases: [],
    marketingName: 'iPhone 15 Pro',
    popularity: 1,
    ...overrides,
  };
}

describe('buildAliasIndex / lookupAlias', () => {
  it('находит устройство по маркетинговому названию без учёта регистра и пробелов', () => {
    const device = buildDevice({ marketingName: 'iPhone 15 Pro' });
    const index = buildAliasIndex([device]);

    expect(lookupAlias(index, 'iphone 15 pro')).toBe(device);
    expect(lookupAlias(index, 'IPHONE 15 PRO')).toBe(device);
    expect(lookupAlias(index, '  iphone   15   pro  ')).toBe(device);
  });

  it('находит устройство по псевдониму из списка aliases', () => {
    const device = buildDevice({ aliases: ['айфон 15 про', '13 pm'] });
    const index = buildAliasIndex([device]);

    expect(lookupAlias(index, 'айфон 15 про')).toBe(device);
    expect(lookupAlias(index, '13 pm')).toBe(device);
  });

  it('возвращает undefined для неизвестного псевдонима', () => {
    const index = buildAliasIndex([buildDevice()]);

    expect(lookupAlias(index, 'совершенно неизвестная строка')).toBeUndefined();
  });

  it('пустой справочник даёт пустой индекс без ошибок', () => {
    const index = buildAliasIndex([]);

    expect(lookupAlias(index, 'iphone')).toBeUndefined();
    expect(index.aliasCollisions).toEqual([]);
  });

  it(
    'КОЛЛИЗИЯ ПСЕВДОНИМОВ: один и тот же псевдоним у двух РАЗНЫХ устройств не резолвится ' +
      'в одно из них произвольно — точный индекс не угадывает (AGENTS.md: "ложный ответ ' +
      'дороже отсутствия ответа"), а коллизия попадает в aliasCollisions',
    () => {
      // marketingName задаётся явно и по-разному для каждого устройства: у buildDevice()
      // общее значение marketingName по умолчанию ('iPhone 15 Pro'), и если его не
      // переопределить, оно само создаст вторую, незапланированную коллизию — что и
      // показал фактический прогон теста.
      const first = buildDevice({
        id: 'device-a',
        marketingName: 'Устройство A',
        aliases: ['galaxy s23'],
      });
      const second = buildDevice({
        id: 'device-b',
        marketingName: 'Устройство B',
        aliases: ['galaxy s23'],
      });
      const index = buildAliasIndex([first, second]);

      expect(lookupAlias(index, 'galaxy s23')).toBeUndefined();
      expect(index.aliasCollisions).toEqual([
        { alias: 'galaxy s23', deviceIds: ['device-a', 'device-b'] },
      ]);
    },
  );

  it('один и тот же псевдоним, повторно указанный у ОДНОГО устройства, коллизией не считается', () => {
    const device = buildDevice({
      marketingName: 'iPhone 15 Pro',
      aliases: ['iphone 15 pro', 'IPHONE 15 PRO'],
    });
    const index = buildAliasIndex([device]);

    expect(lookupAlias(index, 'iphone 15 pro')).toBe(device);
    expect(index.aliasCollisions).toEqual([]);
  });

  it('пустая строка псевдонима не попадает в индекс', () => {
    const device = buildDevice({ aliases: ['', '   '] });
    const index = buildAliasIndex([device]);

    expect(lookupAlias(index, '')).toBeUndefined();
  });
});

describe('buildAliasIndex / lookupModelCode', () => {
  it('находит устройство по сервисному коду без учёта регистра', () => {
    const device = buildDevice({ modelCodes: ['SM-S928B', 'SM-S928U'] });
    const index = buildAliasIndex([device]);

    expect(lookupModelCode(index, 'SM-S928B')).toBe(device);
    expect(lookupModelCode(index, 'sm-s928b')).toBe(device);
  });

  it('возвращает undefined для неизвестного сервисного кода', () => {
    const index = buildAliasIndex([buildDevice({ modelCodes: ['SM-S928B'] })]);

    expect(lookupModelCode(index, 'CPH2451')).toBeUndefined();
  });

  it(
    'КОЛЛИЗИЯ СЕРВИСНЫХ КОДОВ: один код у двух разных устройств (нарушение инварианта ' +
      'docs/05 §5.8) не резолвится в одно из них, а попадает в modelCodeCollisions',
    () => {
      const first = buildDevice({ id: 'device-a', modelCodes: ['SM-S928B'] });
      const second = buildDevice({ id: 'device-b', modelCodes: ['SM-S928B'] });
      const index = buildAliasIndex([first, second]);

      expect(lookupModelCode(index, 'SM-S928B')).toBeUndefined();
      expect(index.modelCodeCollisions).toEqual([
        { modelCode: 'SM-S928B', deviceIds: ['device-a', 'device-b'] },
      ]);
    },
  );

  it('индекс псевдонимов и индекс сервисных кодов не пересекаются', () => {
    const device = buildDevice({ modelCodes: ['SM-S928B'], aliases: ['galaxy s23'] });
    const index = buildAliasIndex([device]);

    expect(lookupAlias(index, 'SM-S928B')).toBeUndefined();
    expect(lookupModelCode(index, 'galaxy s23')).toBeUndefined();
  });
});

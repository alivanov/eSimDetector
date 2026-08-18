import { loadRealDictionary } from '../testing/dictionary-fixture';
import { buildDeviceId } from './device-id';

describe('buildDeviceId', () => {
  const dictionary = loadRealDictionary();

  it.each([
    ['samsung', 'Galaxy S24 Ultra', 'samsung-galaxy-s24-ultra'],
    ['apple', 'iPhone 15 Pro', 'apple-iphone-15-pro'],
    ['apple', 'iPhone X', 'apple-iphone-x'],
    // Конвенция буквы "A" (docs/05-data-model.md §5.3) — цифра поколения приклеена к букве
    // модификатора в исходном тексте, а не к family: итоговый id — "samsung-galaxy-a54", а
    // НЕ "samsung-galaxy54-a", хотя в записи справочника family="galaxy", modifiers=["a"].
    ['samsung', 'Galaxy A54', 'samsung-galaxy-a54'],
    ['google', 'Pixel 7a', 'google-pixel-7a'],
  ])('строит "%s %s" → "%s"', (brand, marketingName, expected) => {
    expect(buildDeviceId(brand, marketingName, dictionary)).toBe(expected);
  });

  it('не включает признак сети "5G" в идентификатор (docs/14 §14.4 шаг 2)', () => {
    expect(buildDeviceId('xiaomi', 'Redmi Note 13 Pro+ 5G', dictionary)).toBe(
      'xiaomi-redmi-note-13-pro',
    );
  });

  it('сливает варианты 4G/5G одной модели в один идентификатор (docs/14 §14.4 шаг 2)', () => {
    const withoutSuffix = buildDeviceId('samsung', 'Galaxy S21', dictionary);
    const with5g = buildDeviceId('samsung', 'Galaxy S21 5G', dictionary);
    expect(withoutSuffix).toBe(with5g);
  });

  it('пропускает пустые фразы в словаре dualSimMarkers без ошибки', () => {
    const dictionaryWithEmptyPhrase = {
      ...dictionary,
      insignificantAttributes: {
        ...dictionary.insignificantAttributes,
        dualSimMarkers: ['', 'dual sim'],
      },
    };
    expect(buildDeviceId('samsung', 'Galaxy S24 Ultra Dual SIM', dictionaryWithEmptyPhrase)).toBe(
      'samsung-galaxy-s24-ultra',
    );
  });

  it('строит одинаковый идентификатор независимо от регистра исходного названия', () => {
    const lower = buildDeviceId('samsung', 'galaxy s24 ultra', dictionary);
    const upper = buildDeviceId('samsung', 'GALAXY S24 ULTRA', dictionary);
    expect(lower).toBe(upper);
  });
});

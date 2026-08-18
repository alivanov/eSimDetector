import { loadRealDictionary } from '../testing/dictionary-fixture';
import { parseMarketingNameSlots } from './marketing-name';

describe('parseMarketingNameSlots', () => {
  const dictionary = loadRealDictionary();

  it('разбирает "Galaxy S24 Ultra" с брендом на family/generation/modifiers', () => {
    expect(parseMarketingNameSlots('samsung', 'Galaxy S24 Ultra', dictionary)).toEqual({
      family: 'galaxy-s',
      generation: 24,
      modifiers: ['ultra'],
      unparsed: [],
    });
  });

  it('соблюдает конвенцию буквы "A" (docs/05 §5.3): family без суффикса, "a" в modifiers', () => {
    expect(parseMarketingNameSlots('samsung', 'Galaxy A54', dictionary)).toEqual({
      family: 'galaxy',
      generation: 54,
      modifiers: ['a'],
      unparsed: [],
    });
  });

  it('соблюдает ту же конвенцию для Google Pixel …a', () => {
    expect(parseMarketingNameSlots('google', 'Pixel 7a', dictionary)).toEqual({
      family: 'pixel',
      generation: 7,
      modifiers: ['a'],
      unparsed: [],
    });
  });

  it('разбирает "iPhone X" на family с буквенным суффиксом без поколения', () => {
    const result = parseMarketingNameSlots('apple', 'iPhone X', dictionary);
    expect(result.family).toBe('iphone-x');
    expect(result.generation).toBeUndefined();
  });

  it('разбирает "iPhone XS Max" — family с суффиксом, "max" в modifiers', () => {
    const result = parseMarketingNameSlots('apple', 'iPhone XS Max', dictionary);
    expect(result.family).toBe('iphone-xs');
    expect(result.modifiers).toEqual(['max']);
  });
});

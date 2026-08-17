import aliasesJson from '../../../data/catalog/aliases.json';

import type { NormalizationDictionary } from './types';
import { parseNormalizationDictionary } from './dictionary';
import { normalizeQuery } from './normalize-query';

/**
 * Полный конвейер тестируется на РЕАЛЬНОМ словаре из data/catalog/aliases.json — это
 * единственный способ проверить сквозное поведение (докладка, синонимы, транслитерация)
 * тем же словарём, которым будет пользоваться приложение, а не урезанной фикстурой,
 * случайно скрывающей рассинхронизацию.
 */
function realDictionary(): NormalizationDictionary {
  const result = parseNormalizationDictionary(aliasesJson);
  if (!result.ok) {
    throw new Error(
      `data/catalog/aliases.json не прошёл валидацию: ${JSON.stringify(result.errors)}`,
    );
  }
  return result.value;
}

describe('normalizeQuery — отдельные проверяемые кейсы агента 2.2', () => {
  it('"iPhone 15 Pro 256Gb черный" даёт generation 15 и attributes.storage "256gb"', () => {
    const result = normalizeQuery('iPhone 15 Pro 256Gb черный', realDictionary());

    expect(result.slots.generation).toBe(15);
    expect(result.slots.attributes.storage).toBe('256gb');
    expect(result.attributes.storage).toBe('256gb');
    expect(result.slots.modelCode).toBeUndefined();
  });

  it('"Galaxy S24 Ultra 5G Dual SIM" даёт generation 24, а не 5', () => {
    const result = normalizeQuery('Galaxy S24 Ultra 5G Dual SIM', realDictionary());

    expect(result.slots.generation).toBe(24);
    expect(result.slots.attributes.network).toBe('5g');
    expect(result.slots.attributes.dualSim).toBe(true);
  });

  it('"SM-S928B" распознаётся как сервисный код и не уходит в нечёткую ветку', () => {
    const result = normalizeQuery('SM-S928B', realDictionary());

    expect(result.slots.modelCode).toBe('SM-S928B');
    expect(result.slots.brand).toBeUndefined();
    expect(result.slots.family).toBeUndefined();
    expect(result.slots.unparsed).toEqual([]);
  });
});

describe('normalizeQuery — сквозной конвейер на русском вводе', () => {
  it('раскрывает синонимы бренда и модификаторов: "айфон 13 про макс"', () => {
    const result = normalizeQuery('айфон 13 про макс', realDictionary());

    expect(result.slots.brand).toBe('iphone');
    expect(result.slots.family).toBe('iphone');
    expect(result.slots.generation).toBe(13);
    expect(result.slots.modifiers).toEqual(['pro', 'max']);
  });

  it('исправляет раскладку клавиатуры и распознаёт бренд: "Ыфьыгтп 23"', () => {
    const result = normalizeQuery('Ыфьыгтп 23', realDictionary());

    expect(result.slots.brand).toBe('samsung');
    expect(result.slots.generation).toBe(23);
  });

  it('раскрывает сокращение и сохраняет генерацию: "редми нот 12 про"', () => {
    const result = normalizeQuery('редми нот 12 про', realDictionary());

    expect(result.slots.brand).toBe('redmi');
    expect(result.slots.family).toBe('note');
    expect(result.slots.generation).toBe(12);
    expect(result.slots.modifiers).toEqual(['pro']);
  });

  it('транслитерирует нераспознанное словарём кириллическое слово, а не отбрасывает его', () => {
    const result = normalizeQuery('тест 5', realDictionary());

    expect(result.slots.family).toBe('test');
    expect(result.slots.generation).toBe(5);
  });
});

describe('normalizeQuery — трассировка (ADR-010)', () => {
  it('возвращает шаги конвейера в порядке выполнения', () => {
    const result = normalizeQuery('iPhone 13 Pro', realDictionary());

    expect(result.trace.map((step) => step.step)).toEqual([
      'unicode',
      'separators',
      'splitLettersAndDigits',
      'lookalikes',
      'keyboardLayout',
      'synonyms',
      'transliteration',
      'tokenize',
    ]);
  });

  it('отмечает изменённые и неизменённые шаги флагом changed', () => {
    const result = normalizeQuery('iPhone 13 Pro', realDictionary());

    const unicodeStep = result.trace.find((step) => step.step === 'unicode');
    expect(unicodeStep?.changed).toBe(true);
    expect(unicodeStep?.output).toBe('iphone 13 pro');

    const keyboardStep = result.trace.find((step) => step.step === 'keyboardLayout');
    expect(keyboardStep?.changed).toBe(false);
  });

  it('трассировка формируется даже когда запрос распознан как сервисный код', () => {
    const result = normalizeQuery('SM-S928B', realDictionary());

    expect(result.trace.length).toBe(8);
  });
});

describe('normalizeQuery — опции', () => {
  it('detectModelCode: false отключает ветку сервисного кода', () => {
    const result = normalizeQuery('CPH2451', realDictionary(), { detectModelCode: false });

    expect(result.slots.modelCode).toBeUndefined();
  });

  it('по умолчанию распознавание сервисного кода включено', () => {
    const result = normalizeQuery('CPH2451', realDictionary());

    expect(result.slots.modelCode).toBe('CPH2451');
  });
});

describe('normalizeQuery — поля результата согласованы', () => {
  it('normalized и tokens отражают финальное состояние конвейера', () => {
    const result = normalizeQuery('IPHONE-13_PRO', realDictionary());

    expect(result.normalized).toBe('iphone 13 pro');
    expect(result.tokens).toEqual(['iphone', '13', 'pro']);
    expect(result.raw).toBe('IPHONE-13_PRO');
  });

  it('attributes на верхнем уровне совпадает с slots.attributes', () => {
    const result = normalizeQuery('iphone 13 128gb', realDictionary());

    expect(result.attributes).toEqual(result.slots.attributes);
  });

  it('пустая строка не приводит к падению и даёт пустые токены', () => {
    const result = normalizeQuery('', realDictionary());

    expect(result.tokens).toEqual([]);
    expect(result.slots.unparsed).toEqual([]);
    expect(result.slots.brand).toBeUndefined();
  });
});

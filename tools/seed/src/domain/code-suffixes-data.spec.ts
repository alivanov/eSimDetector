import codeSuffixesJson from '../../../../data/catalog/code-suffixes.json';
import { KNOWN_BRANDS } from './brands';
import { parseCodeSuffixes, resolveSuffixOutcome, resolveVerifiedRegion } from './code-suffixes';

/**
 * Проверяет ФАЙЛ данных `data/catalog/code-suffixes.json` (агент 5.7, docs/09-decisions.md
 * ADR-026/ADR-028) тем же кодом, которым его читает конвейер — по образцу
 * `curated-apple.spec.ts`/`reference-data.spec.ts` (ADR-016: файл — внешние данные).
 *
 * Ключевая проверка этого файла — не только формат, а СВОЙСТВА, ради которых ADR-028 существует:
 * ни одна запись не несёт статус eSIM ни в каком поле, и каждая связка подтверждена реальной
 * ссылкой на источник с датой сверки, а не согласием источников выгрузки партии 16.
 */

describe('data/catalog/code-suffixes.json', () => {
  it('разбирается без ошибок парсером конвейера', () => {
    const result = parseCodeSuffixes(codeSuffixesJson);
    if (!result.ok) {
      throw new Error(`code-suffixes.json не прошёл валидацию: ${result.errors.join('; ')}`);
    }
    expect(result.value.size).toBeGreaterThan(0);
  });

  it('не содержит "повисших" дублей — размер после разбора равен длине массива', () => {
    expect(Array.isArray(codeSuffixesJson)).toBe(true);
    const result = parseCodeSuffixes(codeSuffixesJson);
    if (!result.ok) {
      throw new Error('файл не прошёл валидацию');
    }
    expect(result.value.size).toBe((codeSuffixesJson as unknown[]).length);
  });

  it('не содержит ни одного значения статуса eSIM ни в каком поле записи (ADR-028)', () => {
    const forbiddenKeys = ['esimEffect', 'esim_effect', 'support', 'status', 'esimSupport', 'esim'];
    for (const rawEntry of codeSuffixesJson as readonly Record<string, unknown>[]) {
      for (const key of forbiddenKeys) {
        expect(Object.hasOwn(rawEntry, key)).toBe(false);
      }
    }
  });

  it('каждая связка подтверждена реальной ссылкой и датой сверки (ADR-026)', () => {
    const result = parseCodeSuffixes(codeSuffixesJson);
    if (!result.ok) {
      throw new Error('файл не прошёл валидацию');
    }
    for (const entry of result.value.values()) {
      expect(entry.sources.length).toBeGreaterThan(0);
      for (const source of entry.sources) {
        expect(source.url.startsWith('https://')).toBe(true);
        expect(source.title.length).toBeGreaterThan(0);
        expect(source.checkedAt.getTime()).not.toBeNaN();
      }
    }
  });

  it('бренд каждой записи входит в словарь известных брендов конвейера', () => {
    const result = parseCodeSuffixes(codeSuffixesJson);
    if (!result.ok) {
      throw new Error('файл не прошёл валидацию');
    }
    for (const entry of result.value.values()) {
      expect(KNOWN_BRANDS.has(entry.brand)).toBe(true);
    }
  });

  it('покрывает китайские окончания Samsung/Huawei/Honor и глобальную схему Xiaomi (объём этапа 5.7)', () => {
    const result = parseCodeSuffixes(codeSuffixesJson);
    if (!result.ok) {
      throw new Error('файл не прошёл валидацию');
    }
    expect(resolveVerifiedRegion('samsung', '0', result.value)).toBe('cn');
    expect(resolveVerifiedRegion('huawei', 'AL00', result.value)).toBe('cn');
    expect(resolveVerifiedRegion('huawei', 'AN00', result.value)).toBe('cn');
    expect(resolveVerifiedRegion('honor', 'AL00', result.value)).toBe('cn');
    expect(resolveVerifiedRegion('honor', 'AN00', result.value)).toBe('cn');
    expect(resolveVerifiedRegion('xiaomi', 'C', result.value)).toBe('cn');
    expect(resolveVerifiedRegion('xiaomi', 'G', result.value)).toBe('global');
    expect(resolveVerifiedRegion('xiaomi', 'I', result.value)).toBe('in');
  });

  it('американская версия Samsung различает операторскую и разблокированную версию (U/U1)', () => {
    const result = parseCodeSuffixes(codeSuffixesJson);
    if (!result.ok) {
      throw new Error('файл не прошёл валидацию');
    }
    expect(resolveVerifiedRegion('samsung', 'U', result.value)).toBe('us');
    expect(resolveVerifiedRegion('samsung', 'U1', result.value)).toBe('us');
  });

  it('спорный суффикс "W" (Канада против Китая, §А.10.4) сознательно не заведён — clarification, а не догадка', () => {
    const result = parseCodeSuffixes(codeSuffixesJson);
    if (!result.ok) {
      throw new Error('файл не прошёл валидацию');
    }
    expect(resolveVerifiedRegion('samsung', 'W', result.value)).toBeUndefined();
    expect(resolveSuffixOutcome('samsung', 'W', result.value)).toEqual({
      kind: 'clarification_required',
    });
  });
});

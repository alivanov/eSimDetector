import { parseCodeSuffixesCsv } from './parse-code-suffixes-csv';

const HEADER = 'brand,code_suffix,code_example,region,esim_effect,confidence,notes';

describe('parseCodeSuffixesCsv', () => {
  it('разбирает корректно оформленную строку партии 16', () => {
    const text = [HEADER, 'Samsung,0,SM-A047F0,cn,not_supported,high,китайская версия'].join('\n');
    const result = parseCodeSuffixesCsv(text);
    expect(result.quarantine).toEqual([]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.row).toEqual({
      brand: 'Samsung',
      codeSuffix: '0',
      codeExample: 'SM-A047F0',
      region: 'cn',
      esimEffect: 'not_supported',
      confidence: 'high',
      notes: 'китайская версия',
    });
  });

  it('карантин строки с неверным числом полей', () => {
    const text = [HEADER, 'Samsung,0,cn,not_supported,high'].join('\n');
    const result = parseCodeSuffixesCsv(text);
    expect(result.rows).toEqual([]);
    expect(result.quarantine).toHaveLength(1);
  });

  it('восстанавливает столбцы по порядку схемы без заголовка', () => {
    const text = 'Huawei,AL00,,cn,not_supported,high,';
    const result = parseCodeSuffixesCsv(text);
    expect(result.notices.some((notice) => notice.code === 'HEADER_MISSING')).toBe(true);
    expect(result.rows[0]?.row.brand).toBe('Huawei');
    expect(result.rows[0]?.row.codeSuffix).toBe('AL00');
  });

  it('на пустом файле не возвращает ни строк, ни карантина', () => {
    const result = parseCodeSuffixesCsv('');
    expect(result).toEqual({ rows: [], quarantine: [], notices: [] });
  });

  it('пропускает повторный заголовок в середине файла', () => {
    const text = [
      HEADER,
      'Samsung,0,SM-A047F0,cn,not_supported,high,',
      HEADER,
      'Samsung,U,SM-A047F0,us,supported,high,',
    ].join('\n');
    const result = parseCodeSuffixesCsv(text);
    expect(result.rows).toHaveLength(2);
    expect(result.notices.some((notice) => notice.code === 'REPEATED_HEADER_SKIPPED')).toBe(true);
  });

  it('восстанавливает недостающее пустое поле "notes" в конце строки', () => {
    const text = [HEADER, 'Samsung,B,SM-A047F0,cn,not_supported,high'].join('\n');
    const result = parseCodeSuffixesCsv(text);
    expect(result.quarantine).toEqual([]);
    expect(result.rows[0]?.wasRealigned).toBe(true);
    expect(result.rows[0]?.row.brand).toBe('Samsung');
    expect(result.rows[0]?.row.notes).toBeUndefined();
  });
});

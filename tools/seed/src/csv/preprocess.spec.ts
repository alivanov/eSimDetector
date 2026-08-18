import { detectDelimiter, preprocessCsvText, splitCsvLine } from './preprocess';

describe('splitCsvLine', () => {
  it('разбивает простую строку по запятой', () => {
    expect(splitCsvLine('Samsung,Galaxy S24,android', ',')).toEqual([
      'Samsung',
      'Galaxy S24',
      'android',
    ]);
  });

  it('не разбивает по разделителю внутри кавычек', () => {
    expect(splitCsvLine('Samsung,"region:CN=no,region:US=yes",android', ',')).toEqual([
      'Samsung',
      'region:CN=no,region:US=yes',
      'android',
    ]);
  });

  it('разворачивает экранированную кавычку "" внутри поля', () => {
    expect(splitCsvLine('Samsung,"Galaxy ""S24"" Ultra",android', ',')).toEqual([
      'Samsung',
      'Galaxy "S24" Ultra',
      'android',
    ]);
  });

  it('поддерживает разделитель ";"', () => {
    expect(splitCsvLine('Samsung;Galaxy S24;android', ';')).toEqual([
      'Samsung',
      'Galaxy S24',
      'android',
    ]);
  });

  it('обрезает пробелы по краям каждого поля', () => {
    expect(splitCsvLine('Samsung , Galaxy S24 ', ',')).toEqual(['Samsung', 'Galaxy S24']);
  });
});

describe('detectDelimiter', () => {
  it('выбирает запятую, когда она даёт точное число столбцов', () => {
    expect(detectDelimiter('brand,marketing_name,platform', 3)).toBe(',');
  });

  it('выбирает точку с запятой, когда она ближе к ожидаемому числу столбцов', () => {
    expect(detectDelimiter('brand;marketing_name;platform', 3)).toBe(';');
  });

  it('не путает точку с запятой ВНУТРИ поля esim_conditions с разделителем строки', () => {
    // 16 полей через запятую, из которых одно (esim_conditions) содержит ";" как внутренний
    // разделитель условий — простой подсчёт символов не должен принять ";" за разделитель строки.
    const line =
      'Samsung,Galaxy S10,SM-G973F,android,phone,2019,conditional,"region:CN=no;region:US=yes",physical+esim,,,,official,,medium,';
    expect(detectDelimiter(line, 16)).toBe(',');
  });
});

describe('preprocessCsvText', () => {
  it('снимает BOM в начале файла', () => {
    const result = preprocessCsvText('\uFEFFbrand,marketing_name,esim_support\nApple,iPhone 15,yes', 3);
    expect(result.notices.some((notice) => notice.code === 'BOM_STRIPPED')).toBe(true);
    expect(result.dataLines[0]?.raw.startsWith('\uFEFF')).toBe(false);
  });

  it('удаляет обёртку в блок кода Markdown', () => {
    const text = ['```csv', 'brand,marketing_name,esim_support', 'Apple,iPhone 15,yes', '```'].join(
      '\n',
    );
    const result = preprocessCsvText(text, 3);
    expect(result.notices.some((notice) => notice.code === 'MARKDOWN_FENCE_STRIPPED')).toBe(true);
    expect(result.dataLines).toHaveLength(2);
  });

  it('отбрасывает пояснительный текст до и после таблицы', () => {
    const text = [
      'Вот запрошенный справочник устройств:',
      'brand,marketing_name,esim_support',
      'Apple,iPhone 15,yes',
      'Надеюсь, это поможет!',
    ].join('\n');
    const result = preprocessCsvText(text, 3);
    expect(result.notices.some((notice) => notice.code === 'PROSE_LINE_SKIPPED')).toBe(true);
    expect(result.dataLines).toHaveLength(2);
  });

  it('сохраняет номера строк исходного файла даже после удаления строк-ограничителей', () => {
    const text = ['```', 'brand,marketing_name,esim_support', 'Apple,iPhone 15,yes', '```'].join('\n');
    const result = preprocessCsvText(text, 3);
    expect(result.dataLines.map((line) => line.lineNumber)).toEqual([2, 3]);
  });

  it('определяет разделитель ";" на уровне файла', () => {
    const text = 'brand;marketing_name;esim_support\nApple;iPhone 15;yes';
    const result = preprocessCsvText(text, 3);
    expect(result.delimiter).toBe(';');
    expect(result.notices.some((notice) => notice.code === 'DELIMITER_SEMICOLON')).toBe(true);
  });

  it('на пустом тексте возвращает пустой список строк без исключения', () => {
    const result = preprocessCsvText('', 16);
    expect(result.dataLines).toEqual([]);
  });
});

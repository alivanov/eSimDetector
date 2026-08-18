import type { CsvFormatNotice, SourceLine } from './types';

/**
 * Устойчивый разбор "сырого" текста выгрузки на строки данных (docs/14-catalog-ingestion.md
 * §14.3): снятие BOM, обёртки в блок кода Markdown, пояснительного текста до и после таблицы,
 * определение разделителя (`,` либо `;`). Работает на уровне строк ФАЙЛА — разбор отдельной
 * строки на поля (с учётом кавычек) выполняет `splitCsvLine` ниже.
 */

const BOM = '\uFEFF';
const MARKDOWN_FENCE_PATTERN = /^\s*```/;

function stripBom(text: string): { text: string; hadBom: boolean } {
  if (text.startsWith(BOM)) {
    return { text: text.slice(BOM.length), hadBom: true };
  }
  return { text, hadBom: false };
}

/**
 * Разбивает строку CSV на поля с учётом кавычек (RFC4180: `""` — экранированная кавычка внутри
 * поля в кавычках). Разделитель передаётся параметром — определяется до вызова `detectDelimiter`.
 */
export function splitCsvLine(line: string, delimiter: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  let index = 0;

  while (index < line.length) {
    const char = line.charAt(index);

    if (inQuotes) {
      if (char === '"') {
        if (line.charAt(index + 1) === '"') {
          current += '"';
          index += 2;
          continue;
        }
        inQuotes = false;
        index += 1;
        continue;
      }
      current += char;
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      index += 1;
      continue;
    }
    if (char === delimiter) {
      fields.push(current);
      current = '';
      index += 1;
      continue;
    }
    current += char;
    index += 1;
  }
  fields.push(current);
  return fields.map((field) => field.trim());
}

/** Число вхождений `char` за пределами кавычек — основа определения разделителя и полей. */
function countUnquotedOccurrences(line: string, char: string): number {
  let count = 0;
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const current = line.charAt(index);
    if (current === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && current === char) {
      count += 1;
    }
  }
  return count;
}

/**
 * Разделитель определяется по строке заголовка (либо по первой похожей на данные строке, если
 * заголовка нет) — выбирается символ, дающий число полей, наиболее близкое к `expectedColumns`.
 * `;` предпочитается только при явном перевесе: `esim_conditions` использует `;` ВНУТРИ поля
 * даже в правильно разделённых запятой строках (docs/appendix-a-llm-csv-request.md §А.2), поэтому
 * простой подсчёт "чего больше" дал бы неверный ответ на некоторых валидных строках с запятой.
 */
export function detectDelimiter(sampleLine: string, expectedColumns: number): ',' | ';' {
  const commaColumns = countUnquotedOccurrences(sampleLine, ',') + 1;
  const semicolonColumns = countUnquotedOccurrences(sampleLine, ';') + 1;
  const commaDiff = Math.abs(commaColumns - expectedColumns);
  const semicolonDiff = Math.abs(semicolonColumns - expectedColumns);
  return semicolonDiff < commaDiff ? ';' : ',';
}

/** Строка похожа на строку данных CSV, а не на пояснительный текст модели до/после таблицы. */
function looksLikeDataLine(line: string, delimiter: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length === 0) {
    return false;
  }
  if (MARKDOWN_FENCE_PATTERN.test(trimmed)) {
    return false;
  }
  // Пояснительный текст модели обычно не содержит разделителя вовсе, либо содержит его
  // один раз в обычном предложении — граница в две и более вхождений отделяет содержательные
  // строки таблицы (минимум 3 поля) от прозы.
  return countUnquotedOccurrences(trimmed, delimiter) >= 2;
}

export interface PreprocessResult {
  readonly dataLines: readonly SourceLine[];
  readonly delimiter: ',' | ';';
  readonly notices: readonly CsvFormatNotice[];
}

/**
 * Полный препроцессинг сырого текста выгрузки в список пронумерованных строк данных
 * (`SourceLine.lineNumber` — 1-based номер в ИСХОДНОМ файле, для отчёта и карантина).
 */
export function preprocessCsvText(rawText: string, expectedColumns: number): PreprocessResult {
  const notices: CsvFormatNotice[] = [];
  const { text, hadBom } = stripBom(rawText);
  if (hadBom) {
    notices.push({ code: 'BOM_STRIPPED', detail: 'Снят символ BOM в начале файла' });
  }

  const allLines = text.split(/\r\n|\r|\n/);
  let fenceStripped = false;
  const withoutFences: SourceLine[] = [];
  allLines.forEach((line, index) => {
    if (MARKDOWN_FENCE_PATTERN.test(line)) {
      fenceStripped = true;
      return;
    }
    withoutFences.push({ lineNumber: index + 1, raw: line });
  });
  if (fenceStripped) {
    notices.push({
      code: 'MARKDOWN_FENCE_STRIPPED',
      detail: 'Удалены строки-ограничители блока кода Markdown (```)',
    });
  }

  const nonEmptyForDetection = withoutFences.find((line) => line.raw.trim().length > 0);
  const delimiter = detectDelimiter(nonEmptyForDetection?.raw ?? '', expectedColumns);
  if (delimiter === ';') {
    notices.push({
      code: 'DELIMITER_SEMICOLON',
      detail: 'Обнаружен разделитель ";" вместо ","',
    });
  }

  let proseSkipped = 0;
  const dataLines: SourceLine[] = [];
  for (const line of withoutFences) {
    if (line.raw.trim().length === 0) {
      continue;
    }
    if (!looksLikeDataLine(line.raw, delimiter)) {
      proseSkipped += 1;
      continue;
    }
    dataLines.push(line);
  }
  if (proseSkipped > 0) {
    notices.push({
      code: 'PROSE_LINE_SKIPPED',
      detail: `Пропущено ${proseSkipped} строк(и) пояснительного текста до/после таблицы`,
    });
  }

  return { dataLines, delimiter, notices };
}

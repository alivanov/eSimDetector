import { CODE_SUFFIX_CSV_COLUMNS, type CodeSuffixCsvFieldKey } from './code-suffix-schema';
import { preprocessCsvText, splitCsvLine } from './preprocess';
import { realignFields, type RealignColumn } from './realign';
import type {
  CodeSuffixCsvRow,
  CsvFormatNotice,
  CsvParseResult,
  CsvQuarantineEntry,
  ParsedCsvRow,
} from './types';

const REALIGN_COLUMNS: readonly RealignColumn[] = CODE_SUFFIX_CSV_COLUMNS.map((column) => ({
  key: column.key,
  required: column.required,
  ...(column.enumValues !== undefined ? { enumValues: column.enumValues } : {}),
}));

// Партия 16 короче и держит схему лучше (docs/appendix-a-llm-csv-request.md §А.10.4: "неверного
// числа полей нет ни в одной строке из 125") — все поля, кроме `notes`, считаются "опознанием".
const IDENTITY_INDEXES = CODE_SUFFIX_CSV_COLUMNS.map((_, index) => index).slice(0, -1);

function tokensLookLikeHeader(tokens: readonly string[]): boolean {
  const lowered = tokens.map((token) => token.trim().toLowerCase());
  return ['brand', 'code_suffix', 'region'].every((name) => lowered.includes(name));
}

function fieldsToRow(fields: readonly (string | undefined)[]): CodeSuffixCsvRow {
  const row: Partial<Record<CodeSuffixCsvFieldKey, string>> = {};
  CODE_SUFFIX_CSV_COLUMNS.forEach((column, index) => {
    const value = fields[index];
    if (value !== undefined && value.length > 0) {
      row[column.key] = value;
    }
  });
  return row;
}

/** Разбор партии 16 — `code-suffixes.csv` (docs/appendix-a-llm-csv-request.md §А.10). */
export function parseCodeSuffixesCsv(rawText: string): CsvParseResult<CodeSuffixCsvRow> {
  const notices: CsvFormatNotice[] = [];
  const quarantine: CsvQuarantineEntry[] = [];
  const rows: ParsedCsvRow<CodeSuffixCsvRow>[] = [];

  const preprocessed = preprocessCsvText(rawText, CODE_SUFFIX_CSV_COLUMNS.length);
  notices.push(...preprocessed.notices);
  const { dataLines, delimiter } = preprocessed;
  if (dataLines.length === 0) {
    return { rows, quarantine, notices };
  }

  const firstLine = dataLines[0];
  const firstTokens = firstLine !== undefined ? splitCsvLine(firstLine.raw, delimiter) : [];
  const hasHeader = tokensLookLikeHeader(firstTokens);
  if (!hasHeader) {
    notices.push({
      code: 'HEADER_MISSING',
      detail: 'Строка заголовка не найдена — столбцы восстановлены по порядку схемы',
    });
  }

  const linesToParse = hasHeader ? dataLines.slice(1) : dataLines;
  let repeatedHeaderCount = 0;

  for (const line of linesToParse) {
    const tokens = splitCsvLine(line.raw, delimiter);
    if (tokensLookLikeHeader(tokens)) {
      repeatedHeaderCount += 1;
      continue;
    }

    const outcome = realignFields(tokens, REALIGN_COLUMNS, IDENTITY_INDEXES);
    if (outcome.status === 'unresolvable') {
      quarantine.push({ code: 'FIELD_COUNT_MISMATCH', sourceLine: line, detail: outcome.detail });
      continue;
    }

    rows.push({
      row: fieldsToRow(outcome.fields),
      sourceLine: line,
      wasRealigned: outcome.status === 'recovered',
    });
  }

  if (repeatedHeaderCount > 0) {
    notices.push({
      code: 'REPEATED_HEADER_SKIPPED',
      detail: `Повторный заголовок встречен и пропущен ${repeatedHeaderCount} раз(а)`,
    });
  }

  return { rows, quarantine, notices };
}

import {
  DEVICES_CSV_COLUMNS,
  IDENTITY_FIELD_KEYS,
  normalizeEsimSupportToken,
  type DevicesCsvFieldKey,
} from './devices-schema';
import { preprocessCsvText, splitCsvLine } from './preprocess';
import { realignFields, type RealignColumn } from './realign';
import type {
  CsvFormatNotice,
  CsvParseResult,
  CsvQuarantineEntry,
  DevicesCsvRow,
  ParsedCsvRow,
} from './types';

const REALIGN_COLUMNS: readonly RealignColumn[] = DEVICES_CSV_COLUMNS.map((column) => ({
  key: column.key,
  required: column.required,
  ...(column.enumValues !== undefined ? { enumValues: column.enumValues } : {}),
}));

const IDENTITY_INDEXES = IDENTITY_FIELD_KEYS.map((key) =>
  DEVICES_CSV_COLUMNS.findIndex((column) => column.key === key),
);

const ESIM_SUPPORT_INDEX = DEVICES_CSV_COLUMNS.findIndex((column) => column.key === 'esimSupport');
const ESIM_CONDITIONS_INDEX = DEVICES_CSV_COLUMNS.findIndex(
  (column) => column.key === 'esimConditions',
);

function tokensLookLikeHeader(tokens: readonly string[]): boolean {
  const lowered = tokens.map((token) => token.trim().toLowerCase());
  const requiredHeaderNames = ['brand', 'marketing_name', 'esim_support'];
  return requiredHeaderNames.every((name) => lowered.includes(name));
}

function fieldsToRow(fields: readonly (string | undefined)[]): DevicesCsvRow {
  const row: Partial<Record<DevicesCsvFieldKey, string>> = {};
  DEVICES_CSV_COLUMNS.forEach((column, index) => {
    const rawValue = fields[index];
    if (rawValue === undefined || rawValue.length === 0) {
      return;
    }
    const value = column.key === 'esimSupport' ? normalizeEsimSupportToken(rawValue) : rawValue;
    row[column.key] = value;
  });
  return row;
}

/**
 * Полный разбор `devices.csv` (docs/14-catalog-ingestion.md §14.3): препроцессинг файла,
 * определение/восстановление заголовка, разбор строк данных с восстановлением выравнивания.
 * Отдельный случай — `esim_conditions` (§14.3): если `esim_support === conditional`, а условие
 * оказалось в неоднозначной (обнулённой) части выравнивания, строка уходит в карантин целиком,
 * а не сохраняется с пустыми условиями (инвариант §5.8 п.5 запрещает `conditional` без условий).
 */
export function parseDevicesCsv(rawText: string): CsvParseResult<DevicesCsvRow> {
  const notices: CsvFormatNotice[] = [];
  const quarantine: CsvQuarantineEntry[] = [];
  const rows: ParsedCsvRow<DevicesCsvRow>[] = [];

  const preprocessed = preprocessCsvText(rawText, DEVICES_CSV_COLUMNS.length);
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
      quarantine.push({
        code: 'FIELD_COUNT_MISMATCH',
        sourceLine: line,
        detail: outcome.detail,
      });
      continue;
    }

    const esimSupportRaw = outcome.fields[ESIM_SUPPORT_INDEX];
    const conditionsRaw = outcome.fields[ESIM_CONDITIONS_INDEX];
    const isConditional =
      esimSupportRaw !== undefined && normalizeEsimSupportToken(esimSupportRaw) === 'conditional';
    const conditionsWereNulled = outcome.status === 'recovered' && conditionsRaw === undefined;

    if (isConditional && conditionsWereNulled) {
      quarantine.push({
        code: 'FIELD_COUNT_MISMATCH',
        sourceLine: line,
        detail:
          'esim_support="conditional", но esim_conditions попало в неоднозначную часть выравнивания — обнулять условие нельзя (§5.8 п.5)',
      });
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

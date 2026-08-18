/**
 * Строка `devices.csv` после разбора (docs/appendix-a-llm-csv-request.md §А.2) — все поля
 * необязательны намеренно: пустое значение в CSV и значение, обнулённое восстановлением
 * выравнивания (docs/14-catalog-ingestion.md §14.3), на этом уровне неразличимы — дальше по
 * конвейеру важно только присутствие/отсутствие, а не причина отсутствия.
 */
export interface DevicesCsvRow {
  readonly brand?: string;
  readonly marketingName?: string;
  readonly modelCodes?: string;
  readonly platform?: string;
  readonly deviceType?: string;
  readonly releaseYear?: string;
  readonly esimSupport?: string;
  readonly esimConditions?: string;
  readonly dualSim?: string;
  readonly maxEsimProfiles?: string;
  readonly osMinVersion?: string;
  readonly osMaxVersion?: string;
  readonly ruMarket?: string;
  readonly sourceUrl?: string;
  readonly confidence?: string;
  readonly notes?: string;
}

/** Строка `<батч>16-code-suffixes.csv` (docs/appendix-a-llm-csv-request.md §А.10). */
export interface CodeSuffixCsvRow {
  readonly brand?: string;
  readonly codeSuffix?: string;
  readonly codeExample?: string;
  readonly region?: string;
  readonly esimEffect?: string;
  readonly confidence?: string;
  readonly notes?: string;
}

/** Один физический номер строки исходного файла — для отчёта и карантина (ADR-010: объяснимость). */
export interface SourceLine {
  readonly lineNumber: number;
  readonly raw: string;
}

export interface ParsedCsvRow<TRow> {
  readonly row: TRow;
  readonly sourceLine: SourceLine;
  /** `true`, если строка восстановлена перебором выравниваний (docs/14 §14.3) — идёт в отчёт. */
  readonly wasRealigned: boolean;
}

export interface CsvFormatNotice {
  readonly code:
    | 'BOM_STRIPPED'
    | 'MARKDOWN_FENCE_STRIPPED'
    | 'PROSE_LINE_SKIPPED'
    | 'DELIMITER_SEMICOLON'
    | 'HEADER_MISSING'
    | 'REPEATED_HEADER_SKIPPED'
    | 'ENUM_ALIAS_NORMALIZED';
  readonly detail: string;
}

export interface CsvQuarantineEntry {
  readonly code: 'FIELD_COUNT_MISMATCH';
  readonly sourceLine: SourceLine;
  readonly detail: string;
}

export interface CsvParseResult<TRow> {
  readonly rows: readonly ParsedCsvRow<TRow>[];
  readonly quarantine: readonly CsvQuarantineEntry[];
  readonly notices: readonly CsvFormatNotice[];
}

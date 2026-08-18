/** Схема столбцов партии 16 — `code-suffixes.csv` (docs/appendix-a-llm-csv-request.md §А.10). */

export type CodeSuffixCsvFieldKey =
  | 'brand'
  | 'codeSuffix'
  | 'codeExample'
  | 'region'
  | 'esimEffect'
  | 'confidence'
  | 'notes';

export interface CodeSuffixCsvColumn {
  readonly key: CodeSuffixCsvFieldKey;
  readonly header: string;
  readonly required: boolean;
  readonly enumValues?: readonly string[];
}

export const CODE_SUFFIX_CSV_COLUMNS: readonly CodeSuffixCsvColumn[] = [
  { key: 'brand', header: 'brand', required: true },
  { key: 'codeSuffix', header: 'code_suffix', required: true },
  { key: 'codeExample', header: 'code_example', required: false },
  {
    key: 'region',
    header: 'region',
    required: true,
    enumValues: [
      'eu',
      'ru',
      'ca',
      'cn',
      'us',
      'kr',
      'in',
      'jp',
      'tr',
      'latam',
      'mea',
      'sea',
      'global',
      'unknown',
    ],
  },
  {
    key: 'esimEffect',
    header: 'esim_effect',
    required: true,
    enumValues: ['supported', 'not_supported', 'same_as_global', 'unknown'],
  },
  { key: 'confidence', header: 'confidence', required: true, enumValues: ['high', 'medium', 'low'] },
  { key: 'notes', header: 'notes', required: false },
];

export const CODE_SUFFIX_CSV_COLUMN_COUNT = CODE_SUFFIX_CSV_COLUMNS.length;

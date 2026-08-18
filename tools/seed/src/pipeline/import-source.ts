import type { NormalizationDictionary } from '@esim-detector/text-normalizer';

import { parseDevicesCsv } from '../csv/parse-devices-csv';
import type { CodePatternMap } from '../domain/code-patterns';
import { resolveCollisions } from '../domain/collisions';
import type { OsVersionCeilings } from '../domain/os-version-ceiling';
import type { DeviceCandidate, QuarantineEntry, RowNotice } from '../domain/types';
import { validateRow } from '../domain/validate-row';
import { applyReferenceCheck, type ReferenceMap } from './reference';

export interface ImportSourceFileResult {
  readonly batchId: string;
  readonly linesParsed: number;
  readonly linesRealigned: number;
  readonly csvQuarantineCount: number;
}

export interface ImportSourceResult {
  readonly source: string;
  readonly candidates: readonly DeviceCandidate[];
  readonly quarantine: readonly QuarantineEntry[];
  readonly notices: readonly RowNotice[];
  readonly files: readonly ImportSourceFileResult[];
  /** Результат сверки с эталоном (docs/14 §14.4 шаг 4) — `checkedCount === 0`, если файла эталона нет. */
  readonly referenceChecked: number;
  readonly referenceMatched: number;
}

export interface ImportSourceOptions {
  readonly source: string;
  readonly files: readonly { readonly batchId: string; readonly text: string }[];
  readonly dictionary: NormalizationDictionary;
  readonly codePatterns: CodePatternMap;
  readonly osVersionCeilings: OsVersionCeilings;
  readonly now: Date;
  readonly reference?: ReferenceMap;
}

/**
 * Полный разбор ОДНОГО источника (docs/14-catalog-ingestion.md §14.4, шаги 1–3): парсинг всех
 * партий `devices.csv` источника, нормализация и валидация каждой строки, разрешение коллизий
 * идентификатора/кода В ПРЕДЕЛАХ источника. Консенсус МЕЖДУ источниками — следующий шаг
 * (`consensus.ts`), сюда не входит: эта функция ничего не знает про другие источники.
 */
export function importSource(options: ImportSourceOptions): ImportSourceResult {
  const { source, files, dictionary, codePatterns, osVersionCeilings, now, reference } = options;

  const allCandidates: DeviceCandidate[] = [];
  const quarantine: QuarantineEntry[] = [];
  const notices: RowNotice[] = [];
  const fileResults: ImportSourceFileResult[] = [];

  for (const file of files) {
    const parsed = parseDevicesCsv(file.text);

    for (const csvQuarantine of parsed.quarantine) {
      quarantine.push({
        code: 'FIELD_COUNT_MISMATCH',
        source,
        batchId: file.batchId,
        lineNumber: csvQuarantine.sourceLine.lineNumber,
        detail: csvQuarantine.detail,
      });
    }

    let realignedCount = 0;
    for (const parsedRow of parsed.rows) {
      if (parsedRow.wasRealigned) {
        realignedCount += 1;
      }
      const result = validateRow(parsedRow.row, {
        source,
        batchId: file.batchId,
        lineNumber: parsedRow.sourceLine.lineNumber,
        now,
        dictionary,
        codePatterns,
        osVersionCeilings,
      });
      notices.push(...result.notices);
      if (result.candidate !== undefined) {
        allCandidates.push(result.candidate);
      }
      if (result.quarantine !== undefined) {
        quarantine.push(result.quarantine);
      }
    }

    fileResults.push({
      batchId: file.batchId,
      linesParsed: parsed.rows.length,
      linesRealigned: realignedCount,
      csvQuarantineCount: parsed.quarantine.length,
    });
  }

  const collisionResult = resolveCollisions(allCandidates);

  // Сверка с эталоном (docs/14 §14.4 шаг 4) — ДО консенсуса (диаграмма §14.4): измеряет качество
  // КАЖДОГО источника отдельно, поэтому должна увидеть решение источника раньше, чем оно
  // смешается с другими источниками на шаге 5.
  const referenceResult = applyReferenceCheck(collisionResult.accepted, reference);
  for (const contradicting of referenceResult.contradicting) {
    quarantine.push({
      code: 'REFERENCE_MISMATCH',
      source: contradicting.provenance.source,
      batchId: contradicting.provenance.batchId,
      lineNumber: contradicting.provenance.lineNumber,
      detail: `Источник указывает "${contradicting.esimSupport}", эталон противоречит этому`,
      rawBrand: contradicting.brand,
      rawMarketingName: contradicting.marketingName,
    });
  }

  return {
    source,
    candidates: referenceResult.accepted,
    quarantine: [...quarantine, ...collisionResult.quarantined],
    notices,
    files: fileResults,
    referenceChecked: referenceResult.checkedCount,
    referenceMatched: referenceResult.matchedCount,
  };
}

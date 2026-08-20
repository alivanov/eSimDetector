import type { NormalizationDictionary } from '@esim-detector/text-normalizer';
import { parseNormalizationDictionary } from '@esim-detector/text-normalizer';

import { parseCodeSuffixesCsv } from '../csv/parse-code-suffixes-csv';
import { parseCodePatterns, type CodePatternMap } from '../domain/code-patterns';
import { parseOsVersionCeilings, type OsVersionCeilings } from '../domain/os-version-ceiling';
import { parseSubbrands, type SubbrandMap } from '../domain/subbrands';
import type {
  CodeSuffixBatchReport,
  DeviceCandidate,
  QuarantineEntry,
  RowNotice,
} from '../domain/types';
import { serializeCandidates } from '../io/candidate-cache';
import {
  discoverImportCsvFiles,
  discoverJsonFiles,
  fileExists,
  readJson,
  readText,
  writeJson,
  type DiscoveredCsvFile,
} from '../io/files';
import { buildCatalog, type BuildCatalogResult } from './build-catalog';
import { parseCuratedDevices } from './merge';
import { importSource, type ImportSourceFileResult } from './import-source';
import { parseReferenceFile, type ReferenceMap } from './reference';
import { normalizeSubbrandCandidates } from './subbrand-merge';

/**
 * Пути к данным конвейера (docs/14-catalog-ingestion.md) — приходят параметром от `cli.ts`,
 * который один во всём инструменте читает `process.argv`/окружение (.cursor/rules/pure-packages.mdc:
 * дисциплина "чтение окружения — только на верхнем уровне" применена и к путям на диске).
 */
export interface PipelinePaths {
  readonly importDir: string;
  readonly curatedDir: string;
  readonly aliasesPath: string;
  readonly codePatternsPath: string;
  readonly osVersionCeilingsPath: string;
  readonly subbrandsPath: string;
  readonly referencePath: string;
  readonly cacheDir: string;
}

function loadDictionaryOrThrow(path: string): NormalizationDictionary {
  const result = parseNormalizationDictionary(readJson(path));
  if (!result.ok) {
    throw new Error(`${path} не прошёл валидацию: ${JSON.stringify(result.errors)}`);
  }
  return result.value;
}

function loadCodePatternsOrThrow(path: string): CodePatternMap {
  const { patterns, errors } = parseCodePatterns(readJson(path));
  if (errors.length > 0) {
    throw new Error(`${path} содержит ошибки: ${errors.join('; ')}`);
  }
  return patterns;
}

function loadOsVersionCeilingsOrThrow(path: string): OsVersionCeilings {
  const result = parseOsVersionCeilings(readJson(path));
  if (!result.ok) {
    throw new Error(`${path} не прошёл валидацию: ${result.errors.join('; ')}`);
  }
  return result.value;
}

/**
 * `data/catalog/subbrands.json` (docs/09-decisions.md ADR-029) — в отличие от шаблонов кодов и
 * потолков версий ОС, отсутствие файла не аварийная ситуация: без него конвейер просто не
 * выполняет слияние подбрендов (POCO/Redmi против Xiaomi) и работает как раньше. Тот же принцип
 * терпимости к отсутствию файла, что и у `tryLoadReference` ниже.
 */
function tryLoadSubbrands(path: string): SubbrandMap {
  if (!fileExists(path)) {
    return new Map();
  }
  const { subbrands, errors } = parseSubbrands(readJson(path));
  if (errors.length > 0) {
    throw new Error(`${path} содержит ошибки: ${errors.join('; ')}`);
  }
  return subbrands;
}

function tryLoadReference(path: string): { reference: ReferenceMap | undefined; missing: boolean } {
  if (!fileExists(path)) {
    // Файл `data/fixtures/catalog.reference.json` не создан на момент реализации агента 4;
    // вопрос 13 решён (docs/09-decisions.md, ADR-013, дополнение "вопрос 13 закрыт" — выборку
    // формирует агент 5.4 по вендорским страницам), но сам файл появится позже. До тех пор
    // отсутствие файла — ожидаемое, а не аварийное состояние.
    return { reference: undefined, missing: true };
  }
  const result = parseReferenceFile(readJson(path));
  if (!result.ok) {
    throw new Error(`${path} не прошёл валидацию: ${result.errors.join('; ')}`);
  }
  return { reference: result.value, missing: false };
}

export interface RunPipelineOptions {
  readonly paths: PipelinePaths;
  readonly now: Date;
  readonly sources?: readonly string[];
  readonly familyMinRecords: number;
  /** Использовать кэш `import` между запусками CLI (docs/14 §14.5) — по умолчанию включено. */
  readonly useCache?: boolean;
  /**
   * Источники, исключённые из консенсуса целиком (docs/appendix-a §А.7: источник, не прошедший
   * проверку пригодности, отбраковывается целиком, а не частично). По умолчанию —
   * `DEFAULT_EXCLUDED_SOURCES` (`gigachat-3-5-ultra`, окончательное решение — docs/09-decisions.md
   * ADR-013, дополнение "вопрос 12 закрыт"). Остаётся параметром, а не константой внутри функции,
   * чтобы будущий пересмотр состава источников не требовал правки кода конвейера.
   */
  readonly excludedSources?: readonly string[];
}

export interface RunPipelineResult extends BuildCatalogResult {
  readonly sourceFiles: readonly (ImportSourceFileResult & { readonly source: string })[];
  readonly candidateNotices: readonly RowNotice[];
  readonly referenceChecked: number;
  readonly referenceMatched: number;
  readonly referenceFileMissing: boolean;
  readonly sourcesProcessed: readonly string[];
  /** Партия 16 — разбор подключён к отчёту, но не к правилу консенсуса (docs/appendix-a §А.10, п.3). */
  readonly codeSuffixBatch: CodeSuffixBatchReport;
}

/**
 * Источник исключён из консенсуса окончательно (docs/09-decisions.md, ADR-013, дополнение
 * "вопрос 12 закрыт"; docs/12-open-questions.md, вопрос 12 — решено). Обоснование — не схема CSV
 * (на партии 16 источник её выдержал, docs/appendix-a §А.10.4), а содержательные дефекты той же
 * партии: суффикс `W` отнесён к Китаю против трёх источников, назвавших Канаду (регион `cn` даёт
 * `not_supported` — готовый ложный отрицательный ответ), суффикс `N` отнесён к Европе против
 * Кореи, и 6 строк из 14 с пустыми обязательными полями.
 */
export const DEFAULT_EXCLUDED_SOURCES: readonly string[] = ['gigachat-3-5-ultra'];

function cachePathFor(cacheDir: string, source: string): string {
  const safeName = source.replace(/[^a-z0-9_-]+/gi, '_');
  return `${cacheDir}/${safeName}.json`;
}

/**
 * Разбирает и валидирует ОДИН источник (шаги 1–4). Файлы разбираются заново при каждом запуске
 * (разбор всей реальной выгрузки занимает доли секунды — см. отчёт агента 4), а кэш `import`
 * (`useCache`) пишется ПОСЛЕ разбора как побочный, не читаемый автоматически артефакт: он
 * фиксирует промежуточный результат шагов 1–4 на диске для внешнего инспектирования между
 * подкомандами (docs/14 §14.5), но НЕ подставляется вместо свежего разбора — иначе строковая
 * статистика отчёта (`linesParsed`/`linesRealigned`) обнулялась бы на кэшированных источниках,
 * а `consensus`/`load` без предварительного `import` дали бы иную (нулевую) статистику, чем те
 * же команды после `import` — отчёт не должен зависеть от порядка вызова подкоманд.
 */
function importOneSource(
  source: string,
  files: readonly { readonly batchId: string; readonly filePath: string }[],
  paths: PipelinePaths,
  dictionary: NormalizationDictionary,
  codePatterns: CodePatternMap,
  osVersionCeilings: OsVersionCeilings,
  reference: ReferenceMap | undefined,
  now: Date,
  useCache: boolean,
): {
  candidates: readonly DeviceCandidate[];
  quarantine: readonly QuarantineEntry[];
  notices: readonly RowNotice[];
  fileResults: readonly ImportSourceFileResult[];
  referenceChecked: number;
  referenceMatched: number;
} {
  const result = importSource({
    source,
    files: files.map((file) => ({ batchId: file.batchId, text: readText(file.filePath) })),
    dictionary,
    codePatterns,
    osVersionCeilings,
    now,
    ...(reference !== undefined ? { reference } : {}),
  });

  if (useCache) {
    writeJson(cachePathFor(paths.cacheDir, source), serializeCandidates(result.candidates));
  }

  return {
    candidates: result.candidates,
    quarantine: result.quarantine,
    notices: result.notices,
    fileResults: result.files,
    referenceChecked: result.referenceChecked,
    referenceMatched: result.referenceMatched,
  };
}

/**
 * Разбирает ВСЕ найденные файлы партии 16 (`16-code-suffixes.csv`, `parseCodeSuffixesCsv`,
 * docs/appendix-a §А.10) и сводит результат в отчёт (agent 5.7). Разбирается КАЖДЫЙ найденный
 * файл независимо от `excludedSources`/`options.sources` устройств: партия 16 не входит в
 * консенсус §14.5 и не проходит через ту же фильтрацию источников, что и `devices.csv` — её роль
 * (docs/appendix-a §А.10, п.3) — генератор перечня кандидатов «суффикс → регион» для РУЧНОЙ
 * сверки, поэтому даже файл источника, исключённого из консенсуса (`gigachat-3-5-ultra`), учтён
 * здесь как есть: исключение из консенсуса не означает исключения из перечня кандидатов.
 */
function parseCodeSuffixBatch(files: readonly DiscoveredCsvFile[]): CodeSuffixBatchReport {
  let rowsParsed = 0;
  let rowsQuarantined = 0;
  const sources = new Set<string>();
  for (const file of files) {
    const result = parseCodeSuffixesCsv(readText(file.filePath));
    rowsParsed += result.rows.length;
    rowsQuarantined += result.quarantine.length;
    sources.add(file.source);
  }
  return {
    filesProcessed: files.length,
    rowsParsed,
    rowsQuarantined,
    sources: [...sources].sort(),
  };
}

/**
 * Полный конвейер (docs/14-catalog-ingestion.md §14.4, шаги 1–7) от файлов на диске до готовых
 * `Device[]` — общее ядро для команд `import`/`consensus`/`load` (они отличаются только тем,
 * какой срез отчёта печатают и пишут ли результат в MongoDB, а не логикой разбора).
 */
export function runPipeline(options: RunPipelineOptions): RunPipelineResult {
  const { paths, now, familyMinRecords } = options;
  const useCache = options.useCache ?? true;
  const excludedSources = options.excludedSources ?? DEFAULT_EXCLUDED_SOURCES;

  const dictionary = loadDictionaryOrThrow(paths.aliasesPath);
  const codePatterns = loadCodePatternsOrThrow(paths.codePatternsPath);
  const osVersionCeilings = loadOsVersionCeilingsOrThrow(paths.osVersionCeilingsPath);
  const subbrands = tryLoadSubbrands(paths.subbrandsPath);
  const { reference, missing: referenceFileMissing } = tryLoadReference(paths.referencePath);

  const discoveredAll = discoverImportCsvFiles(paths.importDir);
  const discovered = discoveredAll.filter((file) => file.kind === 'devices');
  const codeSuffixBatch = parseCodeSuffixBatch(
    discoveredAll.filter((file) => file.kind === 'code-suffixes'),
  );
  const filesBySource = new Map<string, { batchId: string; filePath: string }[]>();
  for (const file of discovered) {
    if (options.sources !== undefined && !options.sources.includes(file.source)) {
      continue;
    }
    if (excludedSources.includes(file.source)) {
      continue;
    }
    const bucket = filesBySource.get(file.source) ?? [];
    bucket.push({ batchId: file.batchId, filePath: file.filePath });
    filesBySource.set(file.source, bucket);
  }

  const allCandidates: DeviceCandidate[] = [];
  const allQuarantine: QuarantineEntry[] = [];
  const allNotices: RowNotice[] = [];
  const sourceFiles: (ImportSourceFileResult & { source: string })[] = [];
  let referenceChecked = 0;
  let referenceMatched = 0;

  for (const [source, files] of filesBySource) {
    const result = importOneSource(
      source,
      files,
      paths,
      dictionary,
      codePatterns,
      osVersionCeilings,
      reference,
      now,
      useCache,
    );
    allCandidates.push(...result.candidates);
    allQuarantine.push(...result.quarantine);
    allNotices.push(...result.notices);
    referenceChecked += result.referenceChecked;
    referenceMatched += result.referenceMatched;
    for (const fileResult of result.fileResults) {
      sourceFiles.push({ ...fileResult, source });
    }
  }

  const curatedFiles = new Map<string, unknown>();
  for (const file of discoverJsonFiles(paths.curatedDir)) {
    curatedFiles.set(file.fileName, readJson(file.filePath));
  }
  const { devices: curatedDevices, errors: curatedErrors } = parseCuratedDevices(curatedFiles);
  if (curatedErrors.length > 0) {
    throw new Error(`data/catalog/curated содержит невалидные записи: ${curatedErrors.join('; ')}`);
  }

  // Слияние подбрендов (docs/09-decisions.md ADR-029) — НАД ВСЕМ пулом кандидатов всех
  // источников, ДО консенсуса (шаг 5): только здесь видны кандидаты с разным `id`, пришедшие от
  // разных источников с разным написанием бренда/подбренда для одного и того же устройства.
  const subbrandMergeResult = normalizeSubbrandCandidates(allCandidates, subbrands, dictionary);

  const catalogResult = buildCatalog({
    candidates: subbrandMergeResult.candidates,
    curatedDevices,
    now,
    familyMinRecords,
  });

  return {
    ...catalogResult,
    quarantine: [...allQuarantine, ...catalogResult.quarantine],
    notices: [...allNotices, ...subbrandMergeResult.notices, ...catalogResult.notices],
    sourceFiles,
    candidateNotices: allNotices,
    referenceChecked,
    referenceMatched,
    referenceFileMissing,
    sourcesProcessed: [...filesBySource.keys()],
    codeSuffixBatch,
  };
}

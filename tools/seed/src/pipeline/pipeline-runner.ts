import type { NormalizationDictionary } from '@esim-detector/text-normalizer';
import { parseNormalizationDictionary } from '@esim-detector/text-normalizer';

import { parseCodePatterns, type CodePatternMap } from '../domain/code-patterns';
import { parseOsVersionCeilings, type OsVersionCeilings } from '../domain/os-version-ceiling';
import type { DeviceCandidate, QuarantineEntry, RowNotice } from '../domain/types';
import { serializeCandidates } from '../io/candidate-cache';
import { discoverImportCsvFiles, discoverJsonFiles, fileExists, readJson, readText, writeJson } from '../io/files';
import { buildCatalog, type BuildCatalogResult } from './build-catalog';
import { parseCuratedDevices } from './merge';
import { importSource, type ImportSourceFileResult } from './import-source';
import { parseReferenceFile, type ReferenceMap } from './reference';

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

function tryLoadReference(path: string): { reference: ReferenceMap | undefined; missing: boolean } {
  if (!fileExists(path)) {
    // Файл `data/fixtures/catalog.reference.json` не создан на момент реализации агента 4
    // (docs/12-open-questions.md, вопрос 13, не решён) — это ожидаемое, а не аварийное состояние.
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
   * Источники, исключённые из консенсуса целиком (docs/appendix-a §А.6/§А.8.1: источник, не
   * выдержавший схему CSV, отбраковывается целиком, а не частично). По умолчанию —
   * `DEFAULT_EXCLUDED_SOURCES` (`gigachat-3-5-ultra`) — действующее решение до тех пор, пока
   * не закрыт вопрос 12 (docs/12-open-questions.md); параметр, а не константа внутри функции,
   * чтобы пересмотр этого вопроса не требовал правки кода конвейера.
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
}

/**
 * Источник, не выдержавший схему CSV на пилотной партии, отбраковывается целиком (docs/appendix-a
 * §А.7, §А.8.1) — действующее решение до тех пор, пока не закрыт вопрос 12 (docs/12-open-questions.md:
 * "пересматриваем ли исключение источника gigachat-3-5-ultra" — вопрос ОТКРЫТ, не решён, но статус-кво
 * до его решения — исключение, а не включение по умолчанию).
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
): { candidates: readonly DeviceCandidate[]; quarantine: readonly QuarantineEntry[]; notices: readonly RowNotice[]; fileResults: readonly ImportSourceFileResult[]; referenceChecked: number; referenceMatched: number } {
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
  const { reference, missing: referenceFileMissing } = tryLoadReference(paths.referencePath);

  const discovered = discoverImportCsvFiles(paths.importDir).filter((file) => file.kind === 'devices');
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

  const catalogResult = buildCatalog({
    candidates: allCandidates,
    curatedDevices,
    now,
    familyMinRecords,
  });

  return {
    ...catalogResult,
    quarantine: [...allQuarantine, ...catalogResult.quarantine],
    notices: [...allNotices, ...catalogResult.notices],
    sourceFiles,
    candidateNotices: allNotices,
    referenceChecked,
    referenceMatched,
    referenceFileMissing,
    sourcesProcessed: [...filesBySource.keys()],
  };
}
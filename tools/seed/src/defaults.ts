import { join } from 'node:path';

import type { PipelinePaths } from './pipeline/pipeline-runner';

/** Корень репозитория — вычисляется от расположения этого файла, а не от `process.cwd()`. */
export const REPO_ROOT = join(__dirname, '../../..');

export function defaultPipelinePaths(): PipelinePaths {
  return {
    importDir: join(REPO_ROOT, 'data/catalog/import'),
    curatedDir: join(REPO_ROOT, 'data/catalog/curated'),
    aliasesPath: join(REPO_ROOT, 'data/catalog/aliases.json'),
    codePatternsPath: join(REPO_ROOT, 'data/catalog/code-patterns.json'),
    osVersionCeilingsPath: join(REPO_ROOT, 'data/catalog/os-version-ceilings.json'),
    subbrandsPath: join(REPO_ROOT, 'data/catalog/subbrands.json'),
    referencePath: join(REPO_ROOT, 'data/fixtures/catalog.reference.json'),
    cacheDir: join(REPO_ROOT, 'tools/seed/.cache'),
  };
}

export const DEFAULT_OVERRIDES_DIR = join(REPO_ROOT, 'data/catalog/overrides');
export const DEFAULT_REPORTS_DIR = join(REPO_ROOT, 'reports');
export const DEFAULT_SNAPSHOT_PATH = join(REPO_ROOT, 'reports/.previous-snapshot.json');

/** Минимальное число записей уровня не ниже `derived` в линейке для агрегации правил (ADR-021). */
export const DEFAULT_FAMILY_MIN_RECORDS = 3;

/**
 * Доля записей, карантинированных по нарушению инвариантов §5.8 относительно всех записей,
 * прошедших консенсус, выше которой `pnpm seed load` отказывается писать в MongoDB целиком
 * (docs/09-decisions.md ADR-029) — параметр импорта, а не константа, "зашитая" в логику проверки:
 * значение можно переопределить без правки кода конвейера (`LoadCommandOptions.invariantQuarantineRatioThreshold`,
 * `--max-quarantine-ratio` у `pnpm seed load`). Значение по умолчанию — 20%: на полном прогоне
 * собранной выгрузки (docs/09 ADR-023, "Последствия") доля нарушений составляет около 6–7%, то
 * есть заметно ниже порога при нормальной работе конвейера, а порог всё равно поймает патологию
 * (например, повреждённый файл словаря брендов), при которой карантинится почти всё.
 */
export const DEFAULT_INVARIANT_QUARANTINE_RATIO_THRESHOLD = 0.2;

export const DEFAULT_MONGODB_URI = 'mongodb://mongo:27017/esim';

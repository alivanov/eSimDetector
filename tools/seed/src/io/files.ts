import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Файловый ввод-вывод конвейера — единственное место в `tools/seed`, которое трогает
 * файловую систему напрямую (.cursor/rules/pure-packages.mdc: чистые функции разбора этого не
 * делают; здесь — CLI-обёртка, ей разрешено, docs/14-catalog-ingestion.md — этот инструмент, а
 * не пакет `packages/*`).
 */

export function fileExists(path: string): boolean {
  return existsSync(path);
}

export function readText(path: string): string {
  return readFileSync(path, 'utf-8');
}

export function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf-8'));
}

export function writeText(path: string, contents: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents, 'utf-8');
}

export function writeJson(path: string, value: unknown): void {
  writeText(path, `${JSON.stringify(value, null, 2)}\n`);
}

export function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true });
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

export interface DiscoveredCsvFile {
  readonly source: string;
  readonly batchId: string;
  readonly filePath: string;
  readonly kind: 'devices' | 'code-suffixes';
}

/**
 * Перечисляет `data/catalog/import/<источник>/<партия>.csv` (docs/appendix-a §А.7, п.1) —
 * структура каталога, а не единственный файл `devices.csv` из упрощённого примера
 * docs/14-catalog-ingestion.md §14.5: реальные выгрузки разбиты на партии по источникам.
 * Партия 16 (`16-code-suffixes.csv`) имеет другую схему столбцов (docs/appendix-a §А.10) —
 * различается по имени файла, а не по содержимому (короткая схема сама по себе не однозначна).
 */
export function discoverImportCsvFiles(importDir: string): readonly DiscoveredCsvFile[] {
  if (!isDirectory(importDir)) {
    return [];
  }
  const files: DiscoveredCsvFile[] = [];
  for (const sourceEntry of readdirSync(importDir, { withFileTypes: true })) {
    if (!sourceEntry.isDirectory()) {
      continue;
    }
    const source = sourceEntry.name;
    const sourceDir = join(importDir, source);
    for (const fileEntry of readdirSync(sourceDir, { withFileTypes: true })) {
      if (!fileEntry.isFile() || !fileEntry.name.endsWith('.csv')) {
        continue;
      }
      const batchId = fileEntry.name.replace(/\.csv$/, '');
      files.push({
        source,
        batchId,
        filePath: join(sourceDir, fileEntry.name),
        kind: fileEntry.name.startsWith('16-') ? 'code-suffixes' : 'devices',
      });
    }
  }
  return files;
}

export interface DiscoveredJsonFile {
  readonly fileName: string;
  readonly filePath: string;
}

/** Перечисляет `*.json` в каталоге (курируемое ядро/решения модератора) — без рекурсии по подкаталогам. */
export function discoverJsonFiles(dir: string): readonly DiscoveredJsonFile[] {
  if (!isDirectory(dir)) {
    return [];
  }
  const files: DiscoveredJsonFile[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.json')) {
      files.push({ fileName: entry.name, filePath: join(dir, entry.name) });
    }
  }
  return files;
}

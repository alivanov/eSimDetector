import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { readJson, writeJson, writeText } from '../io/files';
import type { PipelinePaths } from '../pipeline/pipeline-runner';
import { runImportCommand } from './import';
import { reportFilePaths } from './report-helpers';

const REAL_ALIASES_PATH = join(__dirname, '../../../../data/catalog/aliases.json');
const DEVICES_HEADER =
  'brand,marketing_name,model_codes,platform,device_type,release_year,esim_support,esim_conditions,dual_sim,max_esim_profiles,os_min_version,os_max_version,ru_market,source_url,confidence,notes';

function makePaths(root: string): PipelinePaths {
  return {
    importDir: join(root, 'import'),
    curatedDir: join(root, 'curated'),
    aliasesPath: REAL_ALIASES_PATH,
    codePatternsPath: join(root, 'code-patterns.json'),
    osVersionCeilingsPath: join(root, 'os-version-ceilings.json'),
    referencePath: join(root, 'catalog.reference.json'),
    cacheDir: join(root, '.cache'),
  };
}

describe('runImportCommand', () => {
  let root: string;
  let stdout: string[];
  let originalWrite: typeof process.stdout.write;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'seed-import-cmd-'));
    writeJson(join(root, 'code-patterns.json'), { samsung: '^SM-[A-Z]\\d{3,4}[A-Z0-9]*$' });
    writeJson(join(root, 'os-version-ceilings.json'), { android: 16, ios: 18 });
    writeText(
      join(root, 'import/llm-model-a/02-samsung-galaxy-s.csv'),
      [
        DEVICES_HEADER,
        'Samsung,Galaxy S24 Ultra,SM-S928B,android,phone,2024,yes,,,,,,official,,high,',
      ].join('\n'),
    );

    stdout = [];
    originalWrite = process.stdout.write.bind(process.stdout);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    process.stdout.write = ((chunk: any): boolean => {
      stdout.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;
  });

  afterEach(() => {
    process.stdout.write = originalWrite;
    rmSync(root, { recursive: true, force: true });
  });

  it('печатает отчёт и возвращает 0 без записи файлов при --dry-run', () => {
    const exitCode = runImportCommand({
      dryRun: true,
      paths: makePaths(root),
      reportsDir: join(root, 'reports'),
    });
    expect(exitCode).toBe(0);
    expect(stdout.join('')).toContain('# Отчёт об импорте справочника');

    const { jsonPath } = reportFilePaths(join(root, 'reports'), new Date());
    expect(() => readJson(jsonPath)).toThrow();
  });

  it('без --dry-run записывает отчёт в файлы', () => {
    const exitCode = runImportCommand({
      dryRun: false,
      paths: makePaths(root),
      reportsDir: join(root, 'reports'),
    });
    expect(exitCode).toBe(0);

    const { jsonPath } = reportFilePaths(join(root, 'reports'), new Date());
    const savedReport: unknown = readJson(jsonPath);
    expect(savedReport).toEqual(
      expect.objectContaining({ totals: expect.objectContaining({ accepted: 1 }) }),
    );
  });

  it('без явных путей и --source использует настоящие данные репозитория', () => {
    const exitCode = runImportCommand({ dryRun: true });
    expect(exitCode).toBe(0);
  });

  it('фильтрует по --source', () => {
    writeText(
      join(root, 'import/llm-model-b/02.csv'),
      [
        DEVICES_HEADER,
        'Samsung,Galaxy S23,SM-S911B,android,phone,2023,yes,,,,,,official,,high,',
      ].join('\n'),
    );
    const exitCode = runImportCommand({
      dryRun: true,
      source: 'llm-model-a',
      paths: makePaths(root),
      reportsDir: join(root, 'reports'),
    });
    expect(exitCode).toBe(0);
    expect(stdout.join('')).toContain('samsung');
  });
});

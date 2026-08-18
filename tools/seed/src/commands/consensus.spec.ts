import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { readJson, writeJson, writeText } from '../io/files';
import type { PipelinePaths } from '../pipeline/pipeline-runner';
import { runConsensusCommand } from './consensus';
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

describe('runConsensusCommand', () => {
  let root: string;
  let originalWrite: typeof process.stdout.write;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'seed-consensus-cmd-'));
    writeJson(join(root, 'code-patterns.json'), { samsung: '^SM-[A-Z]\\d{3,4}[A-Z0-9]*$' });
    writeJson(join(root, 'os-version-ceilings.json'), { android: 16, ios: 18 });
    const csv = [
      DEVICES_HEADER,
      'Samsung,Galaxy S24 Ultra,SM-S928B,android,phone,2024,yes,,,,,,official,,high,',
    ].join('\n');
    writeText(join(root, 'import/llm-model-a/02.csv'), csv);
    writeText(join(root, 'import/llm-model-b/02.csv'), csv);

    originalWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = () => true;
  });

  afterEach(() => {
    process.stdout.write = originalWrite;
    rmSync(root, { recursive: true, force: true });
  });

  it('согласовывает несколько источников и записывает отчёт с уровнем "derived"', () => {
    const exitCode = runConsensusCommand({
      dryRun: false,
      paths: makePaths(root),
      reportsDir: join(root, 'reports'),
    });
    expect(exitCode).toBe(0);

    const { jsonPath } = reportFilePaths(join(root, 'reports'), new Date());
    const savedReport: unknown = readJson(jsonPath);
    expect(savedReport).toEqual(
      expect.objectContaining({ byDataConfidence: expect.objectContaining({ derived: 1 }) }),
    );
  });

  it('без явных путей и --sources использует настоящие данные репозитория', () => {
    const exitCode = runConsensusCommand({ dryRun: true });
    expect(exitCode).toBe(0);
  });

  it('--dry-run не пишет файлы отчёта', () => {
    const exitCode = runConsensusCommand({
      dryRun: true,
      paths: makePaths(root),
      reportsDir: join(root, 'reports'),
    });
    expect(exitCode).toBe(0);
    const { jsonPath } = reportFilePaths(join(root, 'reports'), new Date());
    expect(() => readJson(jsonPath)).toThrow();
  });
});

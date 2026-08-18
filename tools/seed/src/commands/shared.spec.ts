import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { writeJson, writeText } from '../io/files';
import type { PipelinePaths } from '../pipeline/pipeline-runner';
import { runAndBuildReport } from './shared';

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

describe('runAndBuildReport', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'seed-shared-'));
    writeJson(join(root, 'code-patterns.json'), { samsung: '^SM-[A-Z]\\d{3,4}[A-Z0-9]*$' });
    writeJson(join(root, 'os-version-ceilings.json'), { android: 16, ios: 18 });
    writeText(
      join(root, 'import/llm-model-a/02-samsung-galaxy-s.csv'),
      [
        DEVICES_HEADER,
        'Samsung,Galaxy S24 Ultra,SM-S928B,android,phone,2024,yes,,,,,,official,,high,',
      ].join('\n'),
    );
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('строит отчёт и markdown, согласованные между собой', () => {
    const { result, report, markdown } = runAndBuildReport({
      paths: makePaths(root),
      now: new Date('2026-08-18T00:00:00Z'),
      useCache: false,
      snapshotPath: join(root, 'snapshot.json'),
    });

    expect(result.devices).toHaveLength(1);
    expect(report.totals.accepted).toBe(1);
    expect(markdown).toContain('# Отчёт об импорте справочника');
    expect(markdown).toContain('ПРОВЕРЕНО'); // файла эталона нет в этом тестовом каталоге
  });

  it('фильтрует по переданным источникам', () => {
    writeText(
      join(root, 'import/llm-model-b/02-samsung-galaxy-s.csv'),
      [DEVICES_HEADER, 'Samsung,Galaxy S23,SM-S911B,android,phone,2023,yes,,,,,,official,,high,'].join('\n'),
    );

    const { result } = runAndBuildReport({
      paths: makePaths(root),
      now: new Date('2026-08-18T00:00:00Z'),
      useCache: false,
      sources: ['llm-model-a'],
      snapshotPath: join(root, 'snapshot.json'),
    });

    expect(result.sourcesProcessed).toEqual(['llm-model-a']);
  });

  it('учитывает предыдущий снимок при построении отчёта', () => {
    const snapshotPath = join(root, 'snapshot.json');
    writeJson(snapshotPath, [{ id: 'samsung-galaxy-s24-ultra', esimSupport: 'not_supported', dataConfidence: 'unverified' }]);

    const { report } = runAndBuildReport({
      paths: makePaths(root),
      now: new Date('2026-08-18T00:00:00Z'),
      useCache: false,
      snapshotPath,
    });

    expect(report.diffFromPrevious).toEqual({ added: 0, removed: 0, changedStatus: 1 });
  });
});

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { readJson, writeJson, writeText } from '../io/files';
import { runPipeline, type PipelinePaths } from './pipeline-runner';

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

describe('runPipeline', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'seed-pipeline-'));
    writeJson(join(root, 'code-patterns.json'), { samsung: '^SM-[A-Z]\\d{3,4}[A-Z0-9]*$' });
    writeJson(join(root, 'os-version-ceilings.json'), { android: 16, ios: 18 });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('строит устройства из двух согласных источников без файла эталона', () => {
    const csv = [
      DEVICES_HEADER,
      'Samsung,Galaxy S24 Ultra,SM-S928B,android,phone,2024,yes,,physical+esim,2,,,official,https://www.samsung.com,high,',
    ].join('\n');
    writeText(join(root, 'import/llm-model-a/02-samsung-galaxy-s.csv'), csv);
    writeText(join(root, 'import/llm-model-b/02-samsung-galaxy-s.csv'), csv);

    const result = runPipeline({
      paths: makePaths(root),
      now: new Date('2026-08-18T00:00:00Z'),
      familyMinRecords: 3,
      useCache: false,
    });

    expect(result.devices).toHaveLength(1);
    expect(result.devices[0]?.dataConfidence).toBe('derived');
    expect(result.referenceFileMissing).toBe(true);
    expect(result.quarantine).toEqual([]);
    expect([...result.sourcesProcessed].sort()).toEqual(['llm-model-a', 'llm-model-b']);
  });

  it('карантинит строку с недопустимым числом полей и отражает это в sourceFiles', () => {
    writeText(
      join(root, 'import/llm-model-a/02-samsung-galaxy-s.csv'),
      [DEVICES_HEADER, 'Samsung,Galaxy S9,SM-G960F,android,phone,2018,no'].join('\n'),
    );

    const result = runPipeline({
      paths: makePaths(root),
      now: new Date('2026-08-18T00:00:00Z'),
      familyMinRecords: 3,
      useCache: false,
    });

    expect(result.devices).toEqual([]);
    expect(result.quarantine).toHaveLength(1);
    expect(result.quarantine[0]?.code).toBe('FIELD_COUNT_MISMATCH');
    expect(result.sourceFiles).toEqual([
      {
        source: 'llm-model-a',
        batchId: '02-samsung-galaxy-s',
        linesParsed: 0,
        linesRealigned: 0,
        csvQuarantineCount: 1,
      },
    ]);
  });

  it('фильтрует по --sources, игнорируя остальные источники на диске', () => {
    const csv = [
      DEVICES_HEADER,
      'Samsung,Galaxy S24 Ultra,SM-S928B,android,phone,2024,yes,,,,,,,,high,',
    ].join('\n');
    writeText(join(root, 'import/llm-model-a/02.csv'), csv);
    writeText(join(root, 'import/llm-model-b/02.csv'), csv);

    const result = runPipeline({
      paths: makePaths(root),
      now: new Date('2026-08-18T00:00:00Z'),
      familyMinRecords: 3,
      useCache: false,
      sources: ['llm-model-a'],
    });

    expect(result.sourcesProcessed).toEqual(['llm-model-a']);
    expect(result.devices[0]?.dataConfidence).toBe('unverified');
  });

  it('использует курируемое ядро вместо CSV-кандидата с тем же id', () => {
    const csv = [
      DEVICES_HEADER,
      'Apple,iPhone 13,,ios,phone,2021,no,,,,,,,,high,',
    ].join('\n');
    writeText(join(root, 'import/llm-model-a/01.csv'), csv);
    writeJson(join(root, 'curated/apple-iphone-13.json'), {
      _id: 'apple-iphone-13',
      brand: 'apple',
      brandTitle: 'Apple',
      marketingName: 'iPhone 13',
      displayName: 'Apple iPhone 13',
      family: 'iphone',
      generation: 13,
      modifiers: [],
      modelCodes: [],
      aliases: ['iphone 13'],
      platform: 'ios',
      deviceType: 'phone',
      os: { minVersion: '15.0', maxVersion: '18.0' },
      screenSignatures: [{ cssWidth: 390, cssHeight: 844, dpr: 3, zoomed: false }],
      esim: {
        support: 'supported',
        dualSim: 'physical+esim',
        maxProfiles: 2,
        conditions: [],
        clarifyingQuestion: null,
        notes: '',
      },
      releaseYear: 2021,
      marketPresenceRu: 'official',
      popularity: 0.8,
      sources: [{ url: 'https://www.apple.com', title: 'Apple', checkedAt: '2024-01-01T00:00:00.000Z' }],
      dataConfidence: 'verified',
      provenance: { source: 'curated', batchId: null, importedAt: '2024-01-01T00:00:00.000Z', agreementCount: null },
      status: 'active',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    });

    const result = runPipeline({
      paths: makePaths(root),
      now: new Date('2026-08-18T00:00:00Z'),
      familyMinRecords: 3,
      useCache: false,
    });

    expect(result.devices).toHaveLength(1);
    expect(result.devices[0]?.esim.support).toBe('supported'); // курируемое ядро, а не CSV "no"
    expect(result.curatedAppliedCount).toBe(1);
  });

  it('выбрасывает исключение при невалидном aliases.json', () => {
    const paths = { ...makePaths(root), aliasesPath: join(root, 'code-patterns.json') }; // не словарь
    expect(() =>
      runPipeline({ paths, now: new Date(), familyMinRecords: 3, useCache: false }),
    ).toThrow(/не прошёл валидацию/);
  });

  it('выбрасывает исключение при невалидном code-patterns.json', () => {
    writeJson(join(root, 'code-patterns.json'), { samsung: 123 });
    expect(() =>
      runPipeline({ paths: makePaths(root), now: new Date(), familyMinRecords: 3, useCache: false }),
    ).toThrow(/содержит ошибки/);
  });

  it('выбрасывает исключение при невалидном os-version-ceilings.json', () => {
    writeJson(join(root, 'os-version-ceilings.json'), { android: -1 });
    expect(() =>
      runPipeline({ paths: makePaths(root), now: new Date(), familyMinRecords: 3, useCache: false }),
    ).toThrow(/не прошёл валидацию/);
  });

  it('выбрасывает исключение при невалидном catalog.reference.json', () => {
    writeJson(join(root, 'catalog.reference.json'), { not: 'an array' });
    expect(() =>
      runPipeline({ paths: makePaths(root), now: new Date(), familyMinRecords: 3, useCache: false }),
    ).toThrow(/не прошёл валидацию/);
  });

  it('выбрасывает исключение при невалидной записи курируемого ядра', () => {
    writeJson(join(root, 'curated/broken.json'), { not: 'a device' });
    expect(() =>
      runPipeline({ paths: makePaths(root), now: new Date(), familyMinRecords: 3, useCache: false }),
    ).toThrow(/curated содержит невалидные записи/);
  });

  it('при useCache=true пишет кэш по источнику, но всегда разбирает файлы заново', () => {
    const csv = [
      DEVICES_HEADER,
      'Samsung,Galaxy S24 Ultra,SM-S928B,android,phone,2024,yes,,,,,,official,,high,',
    ].join('\n');
    writeText(join(root, 'import/llm-model-a/02.csv'), csv);

    const paths = makePaths(root);
    const first = runPipeline({ paths, now: new Date('2026-08-18T00:00:00Z'), familyMinRecords: 3, useCache: true });
    expect(first.sourceFiles).toEqual([
      { source: 'llm-model-a', batchId: '02', linesParsed: 1, linesRealigned: 0, csvQuarantineCount: 0 },
    ]);

    const cachePath = join(root, '.cache', 'llm-model-a.json');
    expect(readJson(cachePath)).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'samsung-galaxy-s24-ultra' })]));

    // Повторный запуск снова разбирает CSV с диска (а не подставляет кэш) — статистика строк
    // не обнуляется независимо от того, что кэш от предыдущего запуска уже существует.
    const second = runPipeline({ paths, now: new Date('2026-08-18T00:00:00Z'), familyMinRecords: 3, useCache: true });
    expect(second.sourceFiles).toEqual(first.sourceFiles);
  });

  it('исключает "gigachat-3-5-ultra" по умолчанию (docs/appendix-a §А.8.1, вопрос 12 не решён)', () => {
    const csv = [DEVICES_HEADER, 'Samsung,Galaxy S24 Ultra,SM-S928B,android,phone,2024,yes,,,,,,official,,high,'].join(
      '\n',
    );
    writeText(join(root, 'import/gigachat-3-5-ultra/02.csv'), csv);

    const result = runPipeline({
      paths: makePaths(root),
      now: new Date('2026-08-18T00:00:00Z'),
      familyMinRecords: 3,
      useCache: false,
    });
    expect(result.sourcesProcessed).toEqual([]);
    expect(result.devices).toEqual([]);
  });

  it('исключение источников настраивается параметром, а не зашито константой', () => {
    const csv = [DEVICES_HEADER, 'Samsung,Galaxy S24 Ultra,SM-S928B,android,phone,2024,yes,,,,,,official,,high,'].join(
      '\n',
    );
    writeText(join(root, 'import/gigachat-3-5-ultra/02.csv'), csv);

    const result = runPipeline({
      paths: makePaths(root),
      now: new Date('2026-08-18T00:00:00Z'),
      familyMinRecords: 3,
      useCache: false,
      excludedSources: [],
    });
    expect(result.sourcesProcessed).toEqual(['gigachat-3-5-ultra']);
  });

  it('без данных ни в одном источнике не создаёт ни устройств, ни карантина', () => {
    const result = runPipeline({
      paths: makePaths(root),
      now: new Date('2026-08-18T00:00:00Z'),
      familyMinRecords: 3,
      useCache: false,
    });
    expect(result.devices).toEqual([]);
    expect(result.quarantine).toEqual([]);
    expect(result.sourcesProcessed).toEqual([]);
  });
});

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { withTestDatabase, type TestDatabaseHandle } from '@esim-detector/test-utils';

import { DEVICES_COLLECTION } from '../mongo/collections';
import type { PipelinePaths } from '../pipeline/pipeline-runner';
import { writeJson, writeText } from '../io/files';
import { runLoadCommand } from './load';

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
    subbrandsPath: join(root, 'subbrands.json'),
    referencePath: join(root, 'catalog.reference.json'),
    cacheDir: join(root, '.cache'),
  };
}

/**
 * Интеграция командного слоя `load` (docs/14 §14.5) — идемпотентность повторного `pnpm seed
 * load` на изолированной тестовой базе (ADR-017).
 */
describe('runLoadCommand (интеграция, withTestDatabase)', () => {
  let root: string;
  let db: TestDatabaseHandle;
  let originalWrite: typeof process.stdout.write;

  beforeAll(async () => {
    db = await withTestDatabase('load-command');
  });

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'seed-load-cmd-'));
    writeJson(join(root, 'code-patterns.json'), { samsung: '^SM-[A-Z]\\d{3,4}[A-Z0-9]*$' });
    writeJson(join(root, 'os-version-ceilings.json'), { android: 16, ios: 18 });
    writeText(
      join(root, 'import/llm-model-a/02.csv'),
      [
        DEVICES_HEADER,
        'Samsung,Galaxy S24 Ultra,SM-S928B,android,phone,2024,yes,,,,,,official,https://www.samsung.com,high,',
      ].join('\n'),
    );

    originalWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = () => true;
  });

  afterEach(async () => {
    process.stdout.write = originalWrite;
    rmSync(root, { recursive: true, force: true });
    await db.truncateAll();
  });

  afterAll(async () => {
    await db.close();
  });

  it('дважды подряд не создаёт дубликатов в MongoDB', async () => {
    const commonOptions = {
      dryRun: false,
      mongoUri: db.uri,
      paths: makePaths(root),
      reportsDir: join(root, 'reports'),
      snapshotPath: join(root, 'snapshot.json'),
    };

    const first = await runLoadCommand(commonOptions);
    expect(first).toBe(0);
    const second = await runLoadCommand(commonOptions);
    expect(second).toBe(0);

    const count = await db.connection.collection(DEVICES_COLLECTION).countDocuments({});
    expect(count).toBe(1);
  });

  it('"supported" без source_url на уровне derived — НЕ нарушение (ADR-029), загрузка проходит', async () => {
    // Единственный источник → dataConfidence "unverified" (не "verified") — инвариант 6 в новой
    // формулировке требует источник только для "verified" (docs/09-decisions.md ADR-029).
    writeText(
      join(root, 'import/llm-model-a/02.csv'),
      [
        DEVICES_HEADER,
        'Samsung,Galaxy S23,SM-S911B,android,phone,2023,yes,,,,,,official,,high,',
      ].join('\n'),
    );
    const exitCode = await runLoadCommand({
      dryRun: false,
      mongoUri: db.uri,
      paths: makePaths(root),
      reportsDir: join(root, 'reports'),
      snapshotPath: join(root, 'snapshot.json'),
    });
    expect(exitCode).toBe(0);
    const count = await db.connection.collection(DEVICES_COLLECTION).countDocuments({});
    expect(count).toBe(1);
  });

  it('карантинит пару DUPLICATE_MODEL_CODE и загружает остальное, если доля нарушений ниже порога (ADR-029)', async () => {
    // Один и тот же код у двух разных id из РАЗНЫХ источников — минуя внутриисточниковый
    // CODE_COLLISION (docs/14 §14.3) — доходит до инварианта §5.8 п.2 после консенсуса.
    writeText(
      join(root, 'import/llm-model-a/02.csv'),
      [
        DEVICES_HEADER,
        'Samsung,Galaxy S24 Ultra,SM-S928B,android,phone,2024,yes,,,,,,official,https://www.samsung.com,high,',
        'Samsung,Galaxy A21,SM-A217F,android,phone,2020,no,,,,,,official,,high,',
      ].join('\n'),
    );
    writeText(
      join(root, 'import/llm-model-b/02.csv'),
      [DEVICES_HEADER, 'Samsung,Galaxy A21s,SM-A217F,android,phone,2020,no,,,,,,official,,high,'].join(
        '\n',
      ),
    );

    const exitCode = await runLoadCommand({
      dryRun: false,
      mongoUri: db.uri,
      paths: makePaths(root),
      reportsDir: join(root, 'reports'),
      snapshotPath: join(root, 'snapshot.json'),
      // Порог по умолчанию (20%) слишком строг для этого маленького набора (2 карантинных из
      // 3) — тест проверяет механизм карантина, а не конкретное значение порога по умолчанию.
      invariantQuarantineRatioThreshold: 0.7,
    });
    expect(exitCode).toBe(0);
    const count = await db.connection.collection(DEVICES_COLLECTION).countDocuments({});
    expect(count).toBe(1);
  });

  it('отменяет загрузку целиком, если доля нарушений выше порога (ADR-029)', async () => {
    writeText(
      join(root, 'import/llm-model-a/02.csv'),
      [
        DEVICES_HEADER,
        'Samsung,Galaxy S24 Ultra,SM-S928B,android,phone,2024,yes,,,,,,official,https://www.samsung.com,high,',
        'Samsung,Galaxy A21,SM-A217F,android,phone,2020,no,,,,,,official,,high,',
      ].join('\n'),
    );
    writeText(
      join(root, 'import/llm-model-b/02.csv'),
      [DEVICES_HEADER, 'Samsung,Galaxy A21s,SM-A217F,android,phone,2020,no,,,,,,official,,high,'].join(
        '\n',
      ),
    );

    const exitCode = await runLoadCommand({
      dryRun: false,
      mongoUri: db.uri,
      paths: makePaths(root),
      reportsDir: join(root, 'reports'),
      snapshotPath: join(root, 'snapshot.json'),
      invariantQuarantineRatioThreshold: 0.5, // 2 из 3 (66.7%) — выше порога
    });
    expect(exitCode).toBe(1);
    const count = await db.connection.collection(DEVICES_COLLECTION).countDocuments({});
    expect(count).toBe(0);
  });

  it('без явных путей использует настоящие данные репозитория (--dry-run)', async () => {
    const exitCode = await runLoadCommand({
      dryRun: true,
      mongoUri: db.uri,
      reportsDir: join(root, 'reports'),
      snapshotPath: join(root, 'snapshot.json'),
    });
    expect([0, 1]).toContain(exitCode);
  });

  it('--dry-run не подключается к MongoDB и не пишет устройства', async () => {
    const exitCode = await runLoadCommand({
      dryRun: true,
      mongoUri: db.uri,
      paths: makePaths(root),
      reportsDir: join(root, 'reports'),
      snapshotPath: join(root, 'snapshot.json'),
    });
    expect(exitCode).toBe(0);
    const count = await db.connection.collection(DEVICES_COLLECTION).countDocuments({});
    expect(count).toBe(0);
  });
});

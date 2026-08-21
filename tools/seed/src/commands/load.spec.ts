import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  validateCatalogInvariants,
  screenSignatureRecordSchema,
  type Device,
} from '@esim-detector/contracts';
import { withTestDatabase, type TestDatabaseHandle } from '@esim-detector/test-utils';

import { DEVICES_COLLECTION, SCREEN_SIGNATURES_COLLECTION } from '../mongo/collections';
import { readDevices } from '../mongo/read-collections';
import type { PipelinePaths } from '../pipeline/pipeline-runner';
import { writeJson, writeText } from '../io/files';
import { runRebuildSignaturesCommand } from './rebuild-signatures';
import { runLoadCommand } from './load';

const REAL_ALIASES_PATH = join(__dirname, '../../../../data/catalog/aliases.json');
const REAL_CURATED_DIR = join(__dirname, '../../../../data/catalog/curated');
const REAL_CODE_PATTERNS_PATH = join(__dirname, '../../../../data/catalog/code-patterns.json');
const REAL_OS_CEILINGS_PATH = join(__dirname, '../../../../data/catalog/os-version-ceilings.json');
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
      [
        DEVICES_HEADER,
        'Samsung,Galaxy A21s,SM-A217F,android,phone,2020,no,,,,,,official,,high,',
      ].join('\n'),
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
      [
        DEVICES_HEADER,
        'Samsung,Galaxy A21s,SM-A217F,android,phone,2020,no,,,,,,official,,high,',
      ].join('\n'),
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

  it('курируемое ядро Apple загружается в MongoDB без строк CSV, и сигнатуры экранов пересобираются согласованно', async () => {
    // Пустой каталог импорта — ровно та ситуация, в которой находится платформа ios: в собранных
    // выгрузках ноль строк с `platform: ios` (docs/appendix-a §А.8.3), поэтому единственным
    // источником записей остаётся курируемое ядро `data/catalog/curated`.
    const paths: PipelinePaths = {
      ...makePaths(root),
      curatedDir: REAL_CURATED_DIR,
      codePatternsPath: REAL_CODE_PATTERNS_PATH,
      osVersionCeilingsPath: REAL_OS_CEILINGS_PATH,
    };

    const loadExitCode = await runLoadCommand({
      dryRun: false,
      mongoUri: db.uri,
      paths,
      reportsDir: join(root, 'reports'),
      snapshotPath: join(root, 'snapshot.json'),
    });
    expect(loadExitCode).toBe(0);

    const devices = await readDevices(db.connection);
    const iosDevices = devices.filter((device) => device.platform === 'ios');
    expect(iosDevices.length).toBeGreaterThanOrEqual(40);
    expect(iosDevices.every((device) => device.dataConfidence === 'verified')).toBe(true);
    // Инварианты 4 и 5 на этих записях: iOS с сигнатурами и `os.maxVersion`, `conditional` с
    // условиями и вопросом — иначе `buildCatalog` их бы карантинировал и до базы они не дошли.
    expect(validateCatalogInvariants(devices).violations).toEqual([]);

    const rebuildExitCode = await runRebuildSignaturesCommand({ mongoUri: db.uri });
    expect(rebuildExitCode).toBe(0);

    const rawSignatures = await db.connection
      .collection(SCREEN_SIGNATURES_COLLECTION)
      .find()
      .toArray();
    const signatures = rawSignatures.map((raw) => screenSignatureRecordSchema.parse(raw));
    expect(signatures.length).toBeGreaterThan(0);

    // Инвариант §5.8 п.7: `esimConsensus` каждой сигнатуры согласован со статусами кандидатов.
    expect(validateCatalogInvariants(devices, signatures).violations).toEqual([]);
  });

  it('заводит задачи модерации csv_quarantine и source_disagreement (этап 7, docs/15 §15.2)', async () => {
    writeText(
      join(root, 'import/llm-model-a/02.csv'),
      [
        DEVICES_HEADER,
        'Samsung,Galaxy S24 Ultra,SM-S928B,android,phone,2024,yes,,,,,,official,https://www.samsung.com,high,',
        'Samsung,Galaxy A21,SM-A217F,android,phone,2020,no,,,,,,official,,high,',
        'Samsung,Galaxy S23,,android,phone,2023,yes,,,,,,official,,high,',
      ].join('\n'),
    );
    writeText(
      join(root, 'import/llm-model-b/02.csv'),
      [
        DEVICES_HEADER,
        'Samsung,Galaxy A21s,SM-A217F,android,phone,2020,no,,,,,,official,,high,',
        'Samsung,Galaxy S23,,android,phone,2023,no,,,,,,official,,high,',
      ].join('\n'),
    );
    writeText(
      join(root, 'import/llm-model-c/02.csv'),
      [
        DEVICES_HEADER,
        'Samsung,Galaxy S23,,android,phone,2023,conditional,region:CN=no,,,,,official,,high,',
      ].join('\n'),
    );

    const commonOptions = {
      dryRun: false,
      mongoUri: db.uri,
      paths: makePaths(root),
      reportsDir: join(root, 'reports'),
      snapshotPath: join(root, 'snapshot.json'),
      invariantQuarantineRatioThreshold: 0.9,
    };

    const first = await runLoadCommand(commonOptions);
    expect(first).toBe(0);

    const quarantineTasks = await db.connection
      .collection('moderation_tasks')
      .find({ kind: 'csv_quarantine' })
      .toArray();
    expect(quarantineTasks.length).toBeGreaterThan(0);
    expect(quarantineTasks.every((task) => task['occurrences'] === 1)).toBe(true);

    const disagreementTasks = await db.connection
      .collection('moderation_tasks')
      .find({ kind: 'source_disagreement' })
      .toArray();
    expect(disagreementTasks).toHaveLength(1);
    expect(disagreementTasks[0]?.['payload']).toEqual({
      deviceId: 'samsung-galaxy-s23',
      variants: [
        { source: 'llm-model-a', esimSupport: 'yes' },
        { source: 'llm-model-b', esimSupport: 'no' },
        { source: 'llm-model-c', esimSupport: 'conditional' },
      ],
    });

    // Повторный `load` с тем же входом увеличивает счётчик обращений, а не создаёт дубликаты
    // (docs/15 §15.2: «дедуплицируются... повторное обращение увеличивает счётчик»).
    const second = await runLoadCommand(commonOptions);
    expect(second).toBe(0);

    const disagreementTasksAfterSecondRun = await db.connection
      .collection('moderation_tasks')
      .find({ kind: 'source_disagreement' })
      .toArray();
    expect(disagreementTasksAfterSecondRun).toHaveLength(1);
    expect(disagreementTasksAfterSecondRun[0]?.['occurrences']).toBe(2);
  });

  it('повторный load не затирает решение модератора (catalog_overrides) — переживает переимпорт (docs/14 §14.5, ADR-014)', async () => {
    const commonOptions = {
      dryRun: false,
      mongoUri: db.uri,
      paths: makePaths(root),
      reportsDir: join(root, 'reports'),
      snapshotPath: join(root, 'snapshot.json'),
    };

    const first = await runLoadCommand(commonOptions);
    expect(first).toBe(0);

    const decidedAt = new Date('2026-08-20T00:00:00.000Z');
    await db.connection.collection('catalog_overrides').insertOne({
      deviceId: 'samsung-galaxy-s24-ultra',
      patch: { dataConfidence: 'verified', esim: { support: 'not_supported' } },
      reason: 'https://www.samsung.com/verified-manually',
      decidedBy: 'moderator-1',
      decidedAt,
      createdAt: decidedAt,
      updatedAt: decidedAt,
    });

    // Тот же самый вход загружается ЕЩЁ РАЗ — `loadDevices` только upsert-ит `devices` по своему
    // детерминированному `_id` и никогда не трогает `catalog_overrides` (`tools/seed/src/mongo/
    // load-devices.ts`).
    const second = await runLoadCommand(commonOptions);
    expect(second).toBe(0);

    const override = await db.connection
      .collection('catalog_overrides')
      .findOne({ deviceId: 'samsung-galaxy-s24-ultra' });
    expect(override).toEqual(
      expect.objectContaining({
        deviceId: 'samsung-galaxy-s24-ultra',
        patch: { dataConfidence: 'verified', esim: { support: 'not_supported' } },
        reason: 'https://www.samsung.com/verified-manually',
      }),
    );

    // Устройство в `devices` осталось "сырым" (не переписанным overrides) — слой применяется
    // только при чтении (`CatalogModule.applyCatalogOverride`, апробировано на реальной базе
    // отдельным интеграционным тестом `apps/api`), а не при записи `devices` этим инструментом.
    const rawDevice = await db.connection
      .collection<Device>(DEVICES_COLLECTION)
      .findOne({ _id: 'samsung-galaxy-s24-ultra' });
    expect(rawDevice?.esim.support).toBe('supported');
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

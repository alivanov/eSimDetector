import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildSampleDevice } from '@esim-detector/contracts';
import { withTestDatabase, type TestDatabaseHandle } from '@esim-detector/test-utils';

import { readJson, writeJson } from '../io/files';
import { CATALOG_OVERRIDES_COLLECTION } from '../mongo/collections';
import { loadDevices } from '../mongo/load-devices';
import { runExportOverridesCommand } from './export-overrides';
import { runRebuildSignaturesCommand } from './rebuild-signatures';
import { runVerifyCommand } from './verify';

describe('команды rebuild-signatures/export-overrides/verify (интеграция, withTestDatabase)', () => {
  let root: string;
  let db: TestDatabaseHandle;
  let originalWrite: typeof process.stdout.write;

  beforeAll(async () => {
    db = await withTestDatabase('mongo-commands');
  });

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'seed-mongo-cmd-'));
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

  it('rebuild-signatures пересобирает screen_signatures из загруженных устройств', async () => {
    const iosDevice = buildSampleDevice({
      _id: 'apple-iphone-13',
      brand: 'apple',
      platform: 'ios',
      os: { minVersion: '15.0', maxVersion: '18.0' },
      screenSignatures: [{ cssWidth: 390, cssHeight: 844, dpr: 3, zoomed: false }],
    });
    await loadDevices(db.connection, [iosDevice]);

    const exitCode = await runRebuildSignaturesCommand({ mongoUri: db.uri });
    expect(exitCode).toBe(0);
  });

  it('export-overrides использует каталог по умолчанию, когда overridesDir не передан', async () => {
    const exitCode = await runExportOverridesCommand({ mongoUri: db.uri });
    expect(exitCode).toBe(0);
  });

  it('export-overrides выгружает решения модератора в JSON-файлы', async () => {
    await db.connection.collection(CATALOG_OVERRIDES_COLLECTION).insertOne({
      deviceId: 'samsung-galaxy-s24-ultra',
      patch: { dataConfidence: 'verified' },
      reason: 'https://www.samsung.com/verified',
      decidedBy: 'moderator',
      decidedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const exitCode = await runExportOverridesCommand({ mongoUri: db.uri, overridesDir: root });
    expect(exitCode).toBe(0);

    const exported: unknown = readJson(join(root, 'samsung-galaxy-s24-ultra.json'));
    expect(exported).toEqual(
      expect.objectContaining({
        deviceId: 'samsung-galaxy-s24-ultra',
        reason: 'https://www.samsung.com/verified',
      }),
    );
  });

  it('export-overrides выгружает устройство, созданное модератором, в data/catalog/curated (этап 7)', async () => {
    await loadDevices(db.connection, [
      buildSampleDevice({
        _id: 'moderator-created-device',
        provenance: {
          source: 'moderator:test-moderator',
          batchId: null,
          importedAt: new Date('2026-08-20'),
          agreementCount: null,
        },
      }),
    ]);

    const exitCode = await runExportOverridesCommand({
      mongoUri: db.uri,
      overridesDir: root,
      curatedDir: root,
    });
    expect(exitCode).toBe(0);

    const exported: unknown = readJson(join(root, 'moderator-moderator-created-device.json'));
    expect(exported).toEqual(
      expect.objectContaining({
        _id: 'moderator-created-device',
        provenance: expect.objectContaining({ source: 'moderator:test-moderator' }),
      }),
    );
  });

  it('export-overrides не выгружает импортированные/курируемые устройства в data/catalog/curated', async () => {
    await loadDevices(db.connection, [buildSampleDevice({ _id: 'samsung-galaxy-s24-ultra' })]);

    const exitCode = await runExportOverridesCommand({
      mongoUri: db.uri,
      overridesDir: root,
      curatedDir: root,
    });
    expect(exitCode).toBe(0);

    expect(() => readJson(join(root, 'moderator-samsung-galaxy-s24-ultra.json'))).toThrow();
  });

  it('verify возвращает 0 на валидном справочнике без файла эталона', async () => {
    await loadDevices(db.connection, [buildSampleDevice({ _id: 'samsung-galaxy-s24-ultra' })]);
    const exitCode = await runVerifyCommand({ mongoUri: db.uri });
    expect(exitCode).toBe(0);
  });

  it('verify возвращает 1 при нарушении инвариантов (два устройства с одним кодом)', async () => {
    await loadDevices(db.connection, [
      buildSampleDevice({ _id: 'a', modelCodes: ['SM-DUPLICATE'] }),
      buildSampleDevice({ _id: 'b', modelCodes: ['SM-DUPLICATE'] }),
    ]);
    const exitCode = await runVerifyCommand({ mongoUri: db.uri });
    expect(exitCode).toBe(1);
  });

  it('verify возвращает 0, когда база согласна с эталоном', async () => {
    await loadDevices(db.connection, [buildSampleDevice({ _id: 'samsung-galaxy-s24-ultra' })]);
    const referencePath = join(root, 'catalog.reference.json');
    writeJson(referencePath, [{ id: 'samsung-galaxy-s24-ultra', esimSupport: 'yes' }]);

    const exitCode = await runVerifyCommand({ mongoUri: db.uri, referencePath });
    expect(exitCode).toBe(0);
  });

  it('verify возвращает 1, когда база противоречит эталону', async () => {
    await loadDevices(db.connection, [buildSampleDevice({ _id: 'samsung-galaxy-s24-ultra' })]);
    const referencePath = join(root, 'catalog.reference.json');
    writeJson(referencePath, [{ id: 'samsung-galaxy-s24-ultra', esimSupport: 'no' }]);

    const exitCode = await runVerifyCommand({ mongoUri: db.uri, referencePath });
    expect(exitCode).toBe(1);
  });

  it('verify сверяет устройство со статусом "not_supported" с эталоном "no"', async () => {
    await loadDevices(db.connection, [
      buildSampleDevice({
        _id: 'samsung-galaxy-s9',
        esim: { ...buildSampleDevice().esim, support: 'not_supported' },
      }),
    ]);
    const referencePath = join(root, 'catalog.reference.json');
    writeJson(referencePath, [{ id: 'samsung-galaxy-s9', esimSupport: 'no' }]);

    const exitCode = await runVerifyCommand({ mongoUri: db.uri, referencePath });
    expect(exitCode).toBe(0);
  });

  it('verify сверяет устройство со статусом "conditional" с эталоном "conditional"', async () => {
    await loadDevices(db.connection, [
      buildSampleDevice({
        _id: 'samsung-galaxy-s10',
        esim: {
          support: 'conditional',
          dualSim: 'physical+esim',
          maxProfiles: 2,
          conditions: [
            { scope: 'region', value: 'CN', support: 'not_supported', note: 'region:CN=no' },
          ],
          clarifyingQuestion: {
            kind: 'region',
            question: 'В каком регионе приобретено устройство?',
            options: [{ value: 'CN', label: 'Китай' }],
          },
          notes: '',
        },
      }),
    ]);
    const referencePath = join(root, 'catalog.reference.json');
    writeJson(referencePath, [{ id: 'samsung-galaxy-s10', esimSupport: 'conditional' }]);

    const exitCode = await runVerifyCommand({ mongoUri: db.uri, referencePath });
    expect(exitCode).toBe(0);
  });

  it('verify возвращает 1, когда файл эталона не проходит валидацию', async () => {
    await loadDevices(db.connection, [buildSampleDevice({ _id: 'samsung-galaxy-s24-ultra' })]);
    const referencePath = join(root, 'catalog.reference.json');
    writeJson(referencePath, [{ id: 'samsung-galaxy-s24-ultra', esimSupport: 'maybe' }]);

    const exitCode = await runVerifyCommand({ mongoUri: db.uri, referencePath });
    expect(exitCode).toBe(1);
  });
});

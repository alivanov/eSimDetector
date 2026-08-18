import { buildSampleDevice } from '@esim-detector/contracts';
import { withTestDatabase, type TestDatabaseHandle } from '@esim-detector/test-utils';

import { rebuildScreenSignatures } from '../pipeline/rebuild-signatures';
import { CATALOG_OVERRIDES_COLLECTION, SCREEN_SIGNATURES_COLLECTION } from './collections';
import { loadDevices } from './load-devices';
import { loadScreenSignatures } from './load-signatures';
import { readCatalogOverrides, readDevices } from './read-collections';

/** Интеграция для `rebuild-signatures`/`export-overrides`/`verify` (ADR-017, withTestDatabase). */
describe('mongo read/write (интеграция, withTestDatabase)', () => {
  let db: TestDatabaseHandle;

  beforeAll(async () => {
    db = await withTestDatabase('mongo-integration');
  });

  afterEach(async () => {
    await db.truncateAll();
  });

  afterAll(async () => {
    await db.close();
  });

  it('readDevices читает и валидирует документы, записанные loadDevices', async () => {
    const device = buildSampleDevice({ _id: 'samsung-galaxy-s24-ultra' });
    await loadDevices(db.connection, [device]);

    const devices = await readDevices(db.connection);
    expect(devices).toHaveLength(1);
    expect(devices[0]?._id).toBe('samsung-galaxy-s24-ultra');
  });

  it('readDevices не падает на пустой коллекции', async () => {
    expect(await readDevices(db.connection)).toEqual([]);
  });

  it('rebuild-signatures целиком: readDevices → rebuildScreenSignatures → loadScreenSignatures', async () => {
    const iosDevice = buildSampleDevice({
      _id: 'apple-iphone-13',
      brand: 'apple',
      platform: 'ios',
      os: { minVersion: '15.0', maxVersion: '18.0' },
      screenSignatures: [{ cssWidth: 390, cssHeight: 844, dpr: 3, zoomed: false }],
    });
    await loadDevices(db.connection, [iosDevice]);

    const devices = await readDevices(db.connection);
    const records = rebuildScreenSignatures(devices, new Date('2026-08-18T00:00:00Z'));
    const inserted = await loadScreenSignatures(db.connection, records);

    expect(inserted).toBe(1);
    const stored = await db.connection
      .collection(SCREEN_SIGNATURES_COLLECTION)
      .findOne({ signature: '390x844@3' });
    expect(stored?.['candidates']).toEqual(['apple-iphone-13']);
  });

  it('loadScreenSignatures возвращает 0 и очищает коллекцию, когда записей нет', async () => {
    const inserted = await loadScreenSignatures(db.connection, []);
    expect(inserted).toBe(0);
    const count = await db.connection.collection(SCREEN_SIGNATURES_COLLECTION).countDocuments({});
    expect(count).toBe(0);
  });

  it('loadScreenSignatures заменяет коллекцию целиком (идемпотентно на повторный вызов)', async () => {
    const first = [
      {
        signature: '390x844@3',
        zoomed: false,
        candidates: ['a'],
        esimConsensus: 'supported' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    await loadScreenSignatures(db.connection, first);
    await loadScreenSignatures(db.connection, first);

    const count = await db.connection.collection(SCREEN_SIGNATURES_COLLECTION).countDocuments({});
    expect(count).toBe(1);
  });

  it('readCatalogOverrides читает решения модератора без изменения loadDevices', async () => {
    await db.connection.collection(CATALOG_OVERRIDES_COLLECTION).insertOne({
      deviceId: 'samsung-galaxy-s24-ultra',
      patch: { dataConfidence: 'verified' },
      reason: 'https://www.samsung.com/verified',
      decidedBy: 'moderator',
      decidedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const device = buildSampleDevice({
      _id: 'samsung-galaxy-s24-ultra',
      dataConfidence: 'unverified',
    });
    await loadDevices(db.connection, [device]);
    await loadDevices(db.connection, [device]); // повторная загрузка не трогает overrides

    const overrides = await readCatalogOverrides(db.connection);
    expect(overrides).toHaveLength(1);
    expect(overrides[0]?.patch.dataConfidence).toBe('verified');

    const devices = await readDevices(db.connection);
    expect(devices[0]?.dataConfidence).toBe('unverified'); // overrides применяются на чтении, не тут
  });
});

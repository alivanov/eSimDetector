import type { Device } from '@esim-detector/contracts';
import { buildSampleDevice } from '@esim-detector/contracts';
import { withTestDatabase, type TestDatabaseHandle } from '@esim-detector/test-utils';

import { DEVICES_COLLECTION } from './collections';
import { loadDevices } from './load-devices';

/**
 * Интеграционный тест идемпотентности загрузки (docs/14-catalog-ingestion.md §14.5:
 * "повторный запуск не создаёт дубликатов") — на изолированной тестовой базе (`withTestDatabase()`,
 * ADR-017), а не на рабочей: `.cursor/rules/test-database-isolation.mdc`.
 */
describe('loadDevices (интеграция, withTestDatabase)', () => {
  let db: TestDatabaseHandle;

  beforeAll(async () => {
    db = await withTestDatabase('load-devices');
  });

  afterEach(async () => {
    await db.truncateAll();
  });

  afterAll(async () => {
    await db.close();
  });

  it('вставляет новые записи и возвращает статистику upsertedCount', async () => {
    const device = buildSampleDevice({ _id: 'samsung-galaxy-s24-ultra' });
    const stats = await loadDevices(db.connection, [device]);
    expect(stats.upserted).toBe(1);
    expect(stats.matched).toBe(0);

    const stored = await db.connection
      .collection<Device>(DEVICES_COLLECTION)
      .findOne({ _id: 'samsung-galaxy-s24-ultra' });
    expect(stored?.brand).toBe('samsung');
  });

  it('повторный запуск с тем же входом не создаёт дубликатов', async () => {
    const device = buildSampleDevice({ _id: 'samsung-galaxy-s24-ultra' });
    await loadDevices(db.connection, [device]);
    const secondRun = await loadDevices(db.connection, [device]);

    expect(secondRun.upserted).toBe(0);
    expect(secondRun.matched).toBe(1);

    const count = await db.connection.collection(DEVICES_COLLECTION).countDocuments({});
    expect(count).toBe(1);
  });

  it('сохраняет исходный createdAt между повторными запусками, обновляя updatedAt', async () => {
    const firstCreatedAt = new Date('2024-01-01T00:00:00.000Z');
    const device = buildSampleDevice({
      _id: 'samsung-galaxy-s24-ultra',
      createdAt: firstCreatedAt,
    });
    await loadDevices(db.connection, [device]);

    const secondCreatedAt = new Date('2025-01-01T00:00:00.000Z');
    const updatedDevice = buildSampleDevice({
      _id: 'samsung-galaxy-s24-ultra',
      createdAt: secondCreatedAt,
      updatedAt: secondCreatedAt,
      popularity: 0.99,
    });
    await loadDevices(db.connection, [updatedDevice]);

    const stored = await db.connection
      .collection<Device>(DEVICES_COLLECTION)
      .findOne({ _id: 'samsung-galaxy-s24-ultra' });
    expect(stored?.createdAt).toBeInstanceOf(Date);
    expect(new Date(stored?.createdAt ?? 0).toISOString()).toBe(firstCreatedAt.toISOString());
    expect(stored?.popularity).toBe(0.99);
  });

  it('не создаёт документов, когда список устройств пуст', async () => {
    const stats = await loadDevices(db.connection, []);
    expect(stats).toEqual({ upserted: 0, matched: 0 });
  });
});

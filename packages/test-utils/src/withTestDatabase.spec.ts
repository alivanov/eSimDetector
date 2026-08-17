import { withTestDatabase, type TestDatabaseHandle } from './withTestDatabase';

describe('withTestDatabase', () => {
  let db: TestDatabaseHandle;

  beforeAll(async () => {
    db = await withTestDatabase('with-test-database-spec');
  });

  afterEach(async () => {
    await db.truncateAll();
  });

  afterAll(async () => {
    await db.close();
  });

  it('выдаёт имя базы данных, заканчивающееся на "_test"', () => {
    expect(db.databaseName.endsWith('_test')).toBe(true);
  });

  it('подключается к работающей базе данных', () => {
    expect(db.connection.readyState).toBe(1);
  });

  it('усекает коллекции между тестами', async () => {
    const db1 = db.connection.db;
    if (!db1) {
      throw new Error('соединение не готово');
    }
    await db1.collection('devices').insertOne({ name: 'iPhone 15 Pro' });
    expect(await db1.collection('devices').countDocuments()).toBe(1);

    await db.truncateAll();

    expect(await db1.collection('devices').countDocuments()).toBe(0);
  });

  it('изолирует разные вызовы withTestDatabase друг от друга', async () => {
    const other = await withTestDatabase('with-test-database-spec-other');
    try {
      expect(other.databaseName).not.toBe(db.databaseName);
    } finally {
      await other.close();
    }
  });
});

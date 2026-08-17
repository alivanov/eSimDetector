import { randomBytes } from 'node:crypto';
import mongoose from 'mongoose';

import { assertSafeTestDatabase, runDestructiveTestOperation } from './guard';
import { TEST_MONGO_URI_ENV_VAR } from './mongoServerRegistry';

export interface TestDatabaseHandle {
  readonly connection: mongoose.Connection;
  readonly uri: string;
  readonly databaseName: string;
  /** Усекает все коллекции базы данных. Используется между тестами. */
  truncateAll(): Promise<void>;
  /** Полностью удаляет тестовую базу данных вместе с индексами. */
  dropDatabase(): Promise<void>;
  /** Закрывает соединение. Общий сервер `mongodb-memory-server` не останавливает. */
  close(): Promise<void>;
}

function buildUniqueTestDatabaseName(namespace: string): string {
  const workerId = process.env['JEST_WORKER_ID'] ?? '0';
  const safeNamespace =
    namespace
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'db';
  const uniquePart = randomBytes(4).toString('hex');
  return `esim_${safeNamespace}_w${workerId}_${uniquePart}_test`;
}

function readSharedMongoUri(): string {
  const uri = process.env[TEST_MONGO_URI_ENV_VAR];
  if (uri === undefined || uri.length === 0) {
    throw new Error(
      `Изолированный сервер MongoDB не запущен: переменная окружения ${TEST_MONGO_URI_ENV_VAR} не задана. ` +
        'Подключите globalSetup/globalTeardown из "@esim-detector/test-utils" в конфигурации Jest.',
    );
  }
  return uri;
}

function buildDatabaseUri(serverUri: string, databaseName: string): string {
  const trimmed = serverUri.endsWith('/') ? serverUri.slice(0, -1) : serverUri;
  return `${trimmed}/${databaseName}`;
}

function requireDb(connection: mongoose.Connection): NonNullable<mongoose.Connection['db']> {
  const { db } = connection;
  if (!db) {
    throw new Error('Соединение с тестовой базой данных ещё не установлено');
  }
  return db;
}

/**
 * Изолированное подключение к тестовой базе данных на уникальное имя.
 * Каждый вызов создаёт отдельное логическое имя базы на общем инстансе
 * `mongodb-memory-server`, поднятом в `globalSetup` (docs/08-testing-and-quality.md, 8.5).
 *
 * `namespace` — человекочитаемая часть имени базы (например, имя файла тестов),
 * не влияет на изоляцию: уникальность гарантируется идентификатором воркера и
 * случайным суффиксом.
 */
export async function withTestDatabase(namespace = 'db'): Promise<TestDatabaseHandle> {
  const nodeEnv = process.env['NODE_ENV'];
  const serverUri = readSharedMongoUri();
  const databaseName = buildUniqueTestDatabaseName(namespace);
  const uri = buildDatabaseUri(serverUri, databaseName);

  const safetyContext = {
    nodeEnv,
    databaseName,
    connectionUri: uri,
    productionConnectionUri: undefined,
  };
  assertSafeTestDatabase(safetyContext);

  const connection = mongoose.createConnection(uri);
  await connection.asPromise();

  return {
    connection,
    uri,
    databaseName,
    async truncateAll(): Promise<void> {
      await runDestructiveTestOperation(safetyContext, async () => {
        const db = requireDb(connection);
        const collections = await db.collections();
        await Promise.all(collections.map((collection) => collection.deleteMany({})));
      });
    },
    async dropDatabase(): Promise<void> {
      await runDestructiveTestOperation(safetyContext, async () => {
        const db = requireDb(connection);
        await db.dropDatabase();
      });
    },
    async close(): Promise<void> {
      await connection.close();
    },
  };
}

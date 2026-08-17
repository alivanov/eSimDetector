import { MongoMemoryServer } from 'mongodb-memory-server';

/**
 * URI изолированного сервера MongoDB публикуется через переменную окружения,
 * потому что `globalSetup` выполняется в основном процессе Jest, а сами тесты —
 * в отдельных дочерних процессах-воркерах, которые наследуют `process.env` на
 * момент запуска (docs/08-testing-and-quality.md, раздел 8.5).
 */
export const TEST_MONGO_URI_ENV_VAR = 'ESIM_DETECTOR_TEST_MONGO_URI';

declare global {
  // `var` в ambient-объявлении — единственный синтаксис TypeScript для расширения
  // `globalThis`; переменная нужна для передачи инстанса между globalSetup и
  // globalTeardown, которые Jest выполняет в одном процессе, но перезагружает
  // как отдельные модули.
  var __esimDetectorTestMongoServer: MongoMemoryServer | undefined;
}

export async function startSharedMongoServer(): Promise<MongoMemoryServer> {
  const server = await MongoMemoryServer.create();
  globalThis.__esimDetectorTestMongoServer = server;
  process.env[TEST_MONGO_URI_ENV_VAR] = server.getUri();
  return server;
}

export async function stopSharedMongoServer(): Promise<void> {
  const server = globalThis.__esimDetectorTestMongoServer;
  if (server) {
    await server.stop();
    globalThis.__esimDetectorTestMongoServer = undefined;
  }
}

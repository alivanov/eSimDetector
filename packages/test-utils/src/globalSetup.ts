import { startSharedMongoServer } from './mongoServerRegistry';

/**
 * Один экземпляр `mongodb-memory-server` на весь запуск Jest: поднимается
 * здесь до старта воркеров, адрес передаётся им через переменную окружения.
 * Docker, установленный MongoDB и файл переменных окружения для этого не нужны.
 */
export default async function globalSetup(): Promise<void> {
  await startSharedMongoServer();
}

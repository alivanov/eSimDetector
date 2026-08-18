import mongoose from 'mongoose';

/**
 * Подключение к рабочей базе MongoDB для `tools/seed` (docs/14-catalog-ingestion.md §14.5) —
 * НЕ используется тестами (ADR-017, `.cursor/rules/test-database-isolation.mdc`: тесты подключаются
 * только через `withTestDatabase()`). `uri` приходит параметром от CLI-обёртки (`cli.ts`), которая
 * одна во всём инструменте имеет право читать `process.env.MONGODB_URI`
 * (.cursor/rules/pure-packages.mdc — впрочем это правило про `packages/*`, а не про `tools/*`,
 * но дисциплина "чтение окружения — только на верхнем уровне" сохраняется и здесь).
 */
export async function connectToMongo(uri: string): Promise<mongoose.Connection> {
  const connection = mongoose.createConnection(uri);
  await connection.asPromise();
  return connection;
}

export async function disconnectFromMongo(connection: mongoose.Connection): Promise<void> {
  await connection.close();
}

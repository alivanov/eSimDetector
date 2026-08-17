/**
 * Защитная проверка перед разрушающими операциями над тестовой базой данных.
 *
 * Три независимых условия должны выполняться одновременно (ADR-017,
 * docs/08-testing-and-quality.md раздел 8.5). Функция намеренно не читает
 * переменные окружения сама — вызывающий код передаёт значения явно, поэтому
 * проверка остаётся чистой и тестируемой без побочных эффектов.
 */
export interface TestDatabaseSafetyContext {
  readonly nodeEnv: string | undefined;
  readonly databaseName: string;
  readonly connectionUri: string;
  readonly productionConnectionUri: string | undefined;
}

export class UnsafeTestDatabaseOperationError extends Error {
  public constructor(reason: string) {
    super(`Отказано в разрушающей операции над тестовой базой данных: ${reason}`);
    this.name = 'UnsafeTestDatabaseOperationError';
  }
}

const TEST_DATABASE_NAME_SUFFIX = '_test';

export function assertSafeTestDatabase(context: TestDatabaseSafetyContext): void {
  if (context.nodeEnv !== 'test') {
    throw new UnsafeTestDatabaseOperationError(
      `NODE_ENV должен быть равен "test", получено ${JSON.stringify(context.nodeEnv)}`,
    );
  }

  if (!context.databaseName.endsWith(TEST_DATABASE_NAME_SUFFIX)) {
    throw new UnsafeTestDatabaseOperationError(
      `имя базы данных "${context.databaseName}" должно заканчиваться на "${TEST_DATABASE_NAME_SUFFIX}"`,
    );
  }

  if (
    context.productionConnectionUri !== undefined &&
    context.productionConnectionUri.length > 0 &&
    context.connectionUri === context.productionConnectionUri
  ) {
    throw new UnsafeTestDatabaseOperationError(
      'строка подключения совпадает со строкой подключения рабочей базы данных',
    );
  }
}

/**
 * Единственная точка входа для разрушающих операций (dropDatabase, массовое
 * удаление документов и т. п.). Операция никогда не выполняется без
 * предварительной проверки контекста.
 */
export async function runDestructiveTestOperation<T>(
  context: TestDatabaseSafetyContext,
  operation: () => Promise<T>,
): Promise<T> {
  assertSafeTestDatabase(context);
  return operation();
}

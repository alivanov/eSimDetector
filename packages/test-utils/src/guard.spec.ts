import {
  assertSafeTestDatabase,
  runDestructiveTestOperation,
  UnsafeTestDatabaseOperationError,
} from './guard';

function buildValidContext(
  overrides: Partial<Parameters<typeof assertSafeTestDatabase>[0]> = {},
): Parameters<typeof assertSafeTestDatabase>[0] {
  return {
    nodeEnv: 'test',
    databaseName: 'esim_health_w1_ab12_test',
    connectionUri: 'mongodb://127.0.0.1:57017/',
    productionConnectionUri: undefined,
    ...overrides,
  };
}

describe('assertSafeTestDatabase', () => {
  it('пропускает контекст, удовлетворяющий всем трём условиям', () => {
    expect(() => assertSafeTestDatabase(buildValidContext())).not.toThrow();
  });

  it('отказывает, если имя базы данных не заканчивается на "_test"', () => {
    expect(() =>
      assertSafeTestDatabase(buildValidContext({ databaseName: 'esim_production' })),
    ).toThrow(UnsafeTestDatabaseOperationError);
  });

  it('отказывает, если NODE_ENV не равен "test"', () => {
    expect(() => assertSafeTestDatabase(buildValidContext({ nodeEnv: 'production' }))).toThrow(
      UnsafeTestDatabaseOperationError,
    );
    expect(() => assertSafeTestDatabase(buildValidContext({ nodeEnv: undefined }))).toThrow(
      UnsafeTestDatabaseOperationError,
    );
  });

  it('отказывает, если строка подключения совпадает с рабочей', () => {
    const productionUri = 'mongodb://mongo:27017/esim';
    expect(() =>
      assertSafeTestDatabase(
        buildValidContext({ connectionUri: productionUri, productionConnectionUri: productionUri }),
      ),
    ).toThrow(UnsafeTestDatabaseOperationError);
  });

  it('не отказывает, если рабочая строка подключения не передана', () => {
    expect(() =>
      assertSafeTestDatabase(buildValidContext({ productionConnectionUri: undefined })),
    ).not.toThrow();
  });
});

describe('runDestructiveTestOperation', () => {
  it('не вызывает операцию, если проверка не пройдена', async () => {
    const operation = jest.fn().mockResolvedValue(undefined);

    await expect(
      runDestructiveTestOperation(
        buildValidContext({ databaseName: 'esim_production' }),
        operation,
      ),
    ).rejects.toThrow(UnsafeTestDatabaseOperationError);

    expect(operation).not.toHaveBeenCalled();
  });

  it('вызывает операцию и возвращает её результат, если проверка пройдена', async () => {
    const operation = jest.fn().mockResolvedValue('ok');

    await expect(runDestructiveTestOperation(buildValidContext(), operation)).resolves.toBe('ok');
    expect(operation).toHaveBeenCalledTimes(1);
  });
});

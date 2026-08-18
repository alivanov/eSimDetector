import { validateEnv } from './env.schema';

describe('validateEnv', () => {
  it('подставляет значения по умолчанию из docs/07-integration.md, раздел 7.8', () => {
    const config = validateEnv({});

    expect(config).toMatchObject({
      PORT: 3000,
      MONGODB_URI: 'mongodb://mongo:27017/esim',
      NODE_ENV: 'production',
      CORS_ORIGINS: '*',
      API_KEYS: '',
      RATE_LIMIT_RPM: 120,
      CONFIDENCE_ANSWER_THRESHOLD: 0.8,
      CONFIDENCE_GAP_THRESHOLD: 0.08,
      ALLOW_DERIVED_CATALOG_ANSWERS: true,
      ALLOW_UNVERIFIED_CATALOG_ANSWERS: false,
      ENABLE_LLM_FALLBACK: false,
      ADMIN_TOKEN: '',
      LOG_LEVEL: 'info',
      RESOLUTION_LOG_TTL_DAYS: 30,
    });
  });

  it('приводит строковые числа и булевы флаги из process.env к нужным типам', () => {
    const config = validateEnv({
      PORT: '4000',
      RATE_LIMIT_RPM: '60',
      ALLOW_DERIVED_CATALOG_ANSWERS: 'false',
      ALLOW_UNVERIFIED_CATALOG_ANSWERS: 'true',
      ENABLE_LLM_FALLBACK: '1',
    });

    expect(config.PORT).toBe(4000);
    expect(config.RATE_LIMIT_RPM).toBe(60);
    expect(config.ALLOW_DERIVED_CATALOG_ANSWERS).toBe(false);
    expect(config.ALLOW_UNVERIFIED_CATALOG_ANSWERS).toBe(true);
    expect(config.ENABLE_LLM_FALLBACK).toBe(true);
  });

  it('отказывает при недопустимом значении NODE_ENV', () => {
    expect(() => validateEnv({ NODE_ENV: 'staging' })).toThrow(
      /Некорректная конфигурация окружения/,
    );
  });

  it('отказывает, если порог уверенности выходит за пределы [0, 1]', () => {
    expect(() => validateEnv({ CONFIDENCE_ANSWER_THRESHOLD: '1.5' })).toThrow();
  });
});

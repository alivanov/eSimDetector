import { z } from 'zod';

/**
 * Полный перечень переменных окружения и значений по умолчанию — docs/07-integration.md,
 * раздел 7.8. Строковые значения из `process.env` — недоверенные внешние данные
 * (ADR-016): они проходят валидацию схемой и только после этого получают тип
 * предметной области, без утверждений `as`.
 */
function booleanEnvVar(defaultValue: boolean) {
  return z
    .string()
    .optional()
    .transform((value) => (value === undefined ? defaultValue : value === 'true' || value === '1'));
}

export const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  MONGODB_URI: z.string().min(1).default('mongodb://mongo:27017/esim'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('production'),
  CORS_ORIGINS: z.string().default('*'),
  API_KEYS: z.string().default(''),
  RATE_LIMIT_RPM: z.coerce.number().int().positive().default(120),
  CONFIDENCE_ANSWER_THRESHOLD: z.coerce.number().min(0).max(1).default(0.8),
  CONFIDENCE_GAP_THRESHOLD: z.coerce.number().min(0).max(1).default(0.08),
  ALLOW_UNVERIFIED_CATALOG_ANSWERS: booleanEnvVar(false),
  ENABLE_LLM_FALLBACK: booleanEnvVar(false),
  ADMIN_TOKEN: z.string().default(''),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'verbose']).default('info'),
  RESOLUTION_LOG_TTL_DAYS: z.coerce.number().int().positive().default(30),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): EnvConfig {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  ${issue.path.join('.') || '(корень)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Некорректная конфигурация окружения:\n${issues}`);
  }
  return result.data;
}

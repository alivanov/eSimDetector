/**
 * Минимальный HTTP-клиент стенда оценки качества (docs/08-testing-and-quality.md, §8.6) —
 * стенд обращается к УЖЕ РАБОТАЮЩЕМУ контуру (`docker compose up -d` + наполнение справочника,
 * docs/07 §7.6) через настоящий HTTP, а не встраивает `apps/api` в свой процесс: `tools/eval`
 * не зависит от NestJS/Mongoose (`.cursor/rules/pure-packages.mdc` — дисциплина границ пакетов
 * применена и к инструментам), а измерение "как отвечает сервис" содержательно требует именно
 * реального ответа поднятого контура, а не вызова функции модуля в памяти.
 */
export function resolveApiBaseUrl(): string {
  return process.env['EVAL_API_BASE_URL'] ?? 'http://localhost:3000';
}

export async function postJson(
  path: string,
  requestBody: unknown,
  headers?: Record<string, string>,
): Promise<unknown> {
  const response = await fetch(`${resolveApiBaseUrl()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(headers ?? {}) },
    body: JSON.stringify(requestBody),
  });
  if (!response.ok) {
    throw new Error(`POST ${path} → HTTP ${response.status}`);
  }
  const responseBody: unknown = await response.json();
  return responseBody;
}

export async function getJson(path: string): Promise<unknown> {
  const response = await fetch(`${resolveApiBaseUrl()}${path}`);
  if (!response.ok) {
    throw new Error(`GET ${path} → HTTP ${response.status}`);
  }
  const responseBody: unknown = await response.json();
  return responseBody;
}

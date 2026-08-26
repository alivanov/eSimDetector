function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export interface RuntimeConfig {
  /** Origin API из `API_UPSTREAM` (nginx подставляет при старте). Может быть docker-именем. */
  readonly apiOrigin: string | undefined;
}

/**
 * Конфиг рантайма веб-образа: nginx отдаёт `/runtime-config.json` с `API_UPSTREAM`
 * (docs/16-deployment.md §16.2). В Vite-dev файла нет — возвращаем пустой конфиг, wake идёт
 * same-origin на прокси `/health`.
 */
export async function loadRuntimeConfig(fetchFn: typeof fetch = fetch): Promise<RuntimeConfig> {
  try {
    const response = await fetchFn('/runtime-config.json', { method: 'GET', cache: 'no-store' });
    if (!response.ok) {
      return { apiOrigin: undefined };
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return { apiOrigin: undefined };
    }
    if (!isRecord(body)) {
      return { apiOrigin: undefined };
    }
    const apiOrigin = body['apiOrigin'];
    if (typeof apiOrigin !== 'string' || apiOrigin.length === 0) {
      return { apiOrigin: undefined };
    }
    return { apiOrigin };
  } catch {
    return { apiOrigin: undefined };
  }
}

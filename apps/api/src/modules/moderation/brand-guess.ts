import { readFileSync } from 'node:fs';

import { REPO_ROOT } from '../../common/repo-root';

/**
 * Частичное распознавание бренда по неизвестному сервисному коду (docs/14-catalog-ingestion.md
 * §14.7: «даже неизвестный код `SM-S9410` по шаблону однозначно опознаётся как Samsung»;
 * docs/15-moderation.md §15.2, столбец «unknown_model_code»: «код, распознанный по шаблону
 * бренд»). Читает `data/catalog/code-patterns.json` — те же вендорские шаблоны, что использует
 * конвейер импорта (`tools/seed/src/domain/code-patterns.ts`, docs/14 §14.3), а не переизобретает
 * их: правило проекта — знания об устройствах живут в данных, а не в коде
 * (.cursor/rules/pure-packages.mdc, тот же принцип применён здесь для единообразия, хотя
 * формально правило написано про `packages/*`). Небольшое дублирование ЗАГРУЗЧИКА (не самих
 * шаблонов) с `tools/seed` — та же причина, что и в `screen-signature-consensus.ts`: `apps/api`
 * не импортирует `tools/seed` как зависимость (разные границы развёртывания), а сам файл данных
 * читается один раз при старте, симметрично `normalizationDictionaryProvider`.
 */
const CODE_PATTERNS_PATH = `${REPO_ROOT}/data/catalog/code-patterns.json`;

function isMetaKey(key: string): boolean {
  return key.startsWith('_');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function loadCodePatterns(): ReadonlyMap<string, RegExp> {
  const raw: unknown = JSON.parse(readFileSync(CODE_PATTERNS_PATH, 'utf-8'));
  const patterns = new Map<string, RegExp>();
  if (!isRecord(raw)) {
    return patterns;
  }
  for (const [brand, pattern] of Object.entries(raw)) {
    if (isMetaKey(brand) || typeof pattern !== 'string') {
      continue;
    }
    try {
      patterns.set(brand, new RegExp(pattern));
    } catch {
      // Невалидное регулярное выражение в файле данных — пропускается: угадывание бренда не
      // обязано быть строгим (это подсказка модератору, а не решение алгоритма определения).
    }
  }
  return patterns;
}

let cachedPatterns: ReadonlyMap<string, RegExp> | undefined;

/** `null`, если код не совпал ни с одним известным вендорским шаблоном (docs/14 §14.3). */
export function guessBrandFromModelCode(code: string): string | null {
  cachedPatterns ??= loadCodePatterns();
  const trimmed = code.trim();
  for (const [brand, pattern] of cachedPatterns) {
    if (pattern.test(trimmed)) {
      return brand;
    }
  }
  return null;
}

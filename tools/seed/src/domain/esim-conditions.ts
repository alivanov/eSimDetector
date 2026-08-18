import type { EsimCondition, EsimConditionSupport } from '@esim-detector/contracts';

/**
 * Разбор `esim_conditions` (docs/appendix-a-llm-csv-request.md §А.2, §А.4 правило 20):
 * пары `scope:value=support` через `;`, например `region:CN=no;region:US=esim-only`.
 * Каждая пара, не разобравшаяся на `ключ:значение` (`CONDITION_SYNTAX_INVALID`, docs/14
 * §14.4 шаг 3), отбрасывается по отдельности — решение о карантине всей строки (когда после
 * отбрасывания `conditions` пуст, а `esim_support === "conditional"`) принимает вызывающая
 * сторона (`validate-row.ts`), а не эта функция.
 */

const PAIR_PATTERN = /^\s*(region|osversion|os_version|firmware)\s*:\s*([^=]+)=\s*(.+?)\s*$/i;

const SUPPORT_ALIASES: Readonly<Record<string, EsimConditionSupport>> = {
  yes: 'supported',
  supported: 'supported',
  'esim-only': 'supported',
  'physical+esim': 'supported',
  'dual-esim': 'supported',
  no: 'not_supported',
  not_supported: 'not_supported',
  none: 'not_supported',
};

export interface ParsedEsimConditions {
  readonly conditions: readonly EsimCondition[];
  /** Число пар, которые не удалось разобрать — попадает в отчёт (docs/14 §14.6). */
  readonly droppedCount: number;
}

function resolveScope(rawScope: string): 'region' | 'osVersion' | undefined {
  const normalized = rawScope.toLowerCase();
  if (normalized === 'region') {
    return 'region';
  }
  if (normalized === 'osversion' || normalized === 'os_version') {
    return 'osVersion';
  }
  return undefined;
}

function resolveSupport(rawSupport: string): EsimConditionSupport | undefined {
  return SUPPORT_ALIASES[rawSupport.trim().toLowerCase()];
}

/** Одно значение региона может прийти как `"CN/HK"` (докладные данные пилота) — раскрывается в несколько условий. */
function splitValues(rawValue: string): readonly string[] {
  return rawValue
    .split(/[/,]/)
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

export function parseEsimConditions(raw: string | undefined): ParsedEsimConditions {
  if (raw === undefined || raw.trim().length === 0) {
    return { conditions: [], droppedCount: 0 };
  }

  const pairs = raw
    .split(';')
    .map((pair) => pair.trim())
    .filter((pair) => pair.length > 0);

  const conditions: EsimCondition[] = [];
  let droppedCount = 0;

  for (const pair of pairs) {
    const match = PAIR_PATTERN.exec(pair);
    const scope = match !== null ? resolveScope(match[1] ?? '') : undefined;
    const support = match !== null ? resolveSupport(match[3] ?? '') : undefined;

    if (match === null || scope === undefined || support === undefined) {
      droppedCount += 1;
      continue;
    }

    const values = splitValues(match[2] ?? '');
    if (values.length === 0) {
      droppedCount += 1;
      continue;
    }
    for (const value of values) {
      conditions.push({ scope, value, support, note: pair });
    }
  }

  return { conditions, droppedCount };
}

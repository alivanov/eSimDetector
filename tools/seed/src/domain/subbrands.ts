import { KNOWN_BRANDS } from './brands';

/**
 * Разбор и применение `data/catalog/subbrands.json` (docs/09-decisions.md ADR-029) — соответствие
 * официальных подбрендов (POCO, Redmi) материнскому бренду (Xiaomi). Файл — внешние данные
 * (ADR-016): значение приходит как `unknown` и проверяется вручную, без утверждений `as`.
 *
 * Знание о том, какие бренды являются подбрендами друг друга, живёт в этом файле, а не в
 * константе кода (.cursor/rules/catalog-data.mdc, `.cursor/rules/pure-packages.mdc`) — расширение
 * списка подбрендов (например, при появлении курируемого ядра для новых линеек) не требует
 * правки кода конвейера.
 */

export type SubbrandMap = ReadonlyMap<string, string>;

export interface SubbrandParseResult {
  readonly subbrands: SubbrandMap;
  readonly errors: readonly string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Ключи, начинающиеся с "_", — метаданные файла (`_comment`), а не запись подбренда. */
function isMetaKey(key: string): boolean {
  return key.startsWith('_');
}

export function parseSubbrands(value: unknown): SubbrandParseResult {
  if (!isRecord(value)) {
    return { subbrands: new Map(), errors: ['data/catalog/subbrands.json: ожидался объект'] };
  }

  const subbrands = new Map<string, string>();
  const errors: string[] = [];
  for (const [key, parentValue] of Object.entries(value)) {
    if (isMetaKey(key)) {
      continue;
    }
    if (typeof parentValue !== 'string') {
      errors.push(`subbrands.json["${key}"]: ожидалась строка — бренд-родитель`);
      continue;
    }
    const subbrand = key.toLowerCase();
    const parent = parentValue.toLowerCase();
    if (!KNOWN_BRANDS.has(subbrand)) {
      errors.push(`subbrands.json["${key}"]: подбренд не входит в KNOWN_BRANDS`);
      continue;
    }
    if (!KNOWN_BRANDS.has(parent)) {
      errors.push(`subbrands.json["${key}"]: материнский бренд "${parentValue}" не входит в KNOWN_BRANDS`);
      continue;
    }
    if (subbrand === parent) {
      errors.push(`subbrands.json["${key}"]: подбренд не может быть материнским брендом сам себе`);
      continue;
    }
    subbrands.set(subbrand, parent);
  }

  return { subbrands, errors };
}

export interface SubbrandIdentity {
  /** Канонический ключ подбренда (`poco`, `redmi`), к которому сводится идентичность записи. */
  readonly subbrand: string;
  /** Остаток названия после снятия подбрендового префикса — "как есть", для восстановления `marketingName`. */
  readonly remainderText: string;
  /** Тот же остаток в нижнем регистре — для сравнения кандидатов между собой. */
  readonly remainderKey: string;
}

/**
 * Снимает первое слово `text`, если оно совпадает с `word` без учёта регистра. Возвращает
 * `undefined`, если слово не совпало ИЛИ если после снятия ничего не остаётся (название не может
 * стать пустым — это была бы уже не нормализация, а потеря записи).
 */
function stripLeadingWord(text: string, word: string): string | undefined {
  const trimmed = text.trim();
  const spaceIndex = trimmed.indexOf(' ');
  const firstWord = spaceIndex === -1 ? trimmed : trimmed.slice(0, spaceIndex);
  if (firstWord.toLowerCase() !== word.toLowerCase()) {
    return undefined;
  }
  const remainder = spaceIndex === -1 ? '' : trimmed.slice(spaceIndex + 1).trim();
  return remainder.length > 0 ? remainder : undefined;
}

/**
 * Подбрендовая идентичность записи — вычисляется, только если её вообще можно определить по
 * известному соответствию подбрендов. Ничего не решает о том, безопасно ли объединять с другой
 * записью: это делает `normalizeSubbrandCandidates` (`pipeline/subbrand-merge.ts`), требуя
 * совпадения РЕАЛЬНОГО сервисного кода — угадывать эквивалентность двух написаний по одному
 * совпадению текста запрещено тем же принципом, что ADR-003 запрещает угадывать статус eSIM.
 *
 * Два равноправных случая:
 * 1. `brand` сам является известным подбрендом (`"poco"`) — снимается СОБСТВЕННЫЙ повтор в
 *    названии (`"POCO F3"` → остаток `"F3"`; если повтора нет, остаток — исходное название целиком).
 * 2. `brand` — материнский бренд (`"xiaomi"`) для какого-то подбренда, а название начинается с
 *    названия этого подбренда (`"Redmi 9"` → подбренд `"redmi"`, остаток `"9"`). Если название не
 *    начинается ни с одного известного подбренда — идентичность не определена вовсе.
 */
export function resolveSubbrandIdentity(
  brand: string,
  marketingName: string,
  subbrands: SubbrandMap,
): SubbrandIdentity | undefined {
  if (subbrands.has(brand)) {
    const ownTitle = KNOWN_BRANDS.get(brand) ?? brand;
    const stripped = stripLeadingWord(marketingName, ownTitle);
    const remainderText = stripped ?? marketingName.trim();
    return { subbrand: brand, remainderText, remainderKey: remainderText.toLowerCase() };
  }

  for (const [subbrand, parent] of subbrands) {
    if (parent !== brand) {
      continue;
    }
    const subbrandTitle = KNOWN_BRANDS.get(subbrand);
    if (subbrandTitle === undefined) {
      continue;
    }
    const stripped = stripLeadingWord(marketingName, subbrandTitle);
    if (stripped !== undefined) {
      return { subbrand, remainderText: stripped, remainderKey: stripped.toLowerCase() };
    }
  }

  return undefined;
}

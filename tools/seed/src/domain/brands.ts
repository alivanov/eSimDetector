/**
 * Известные бренды выгрузки (docs/appendix-a-llm-csv-request.md §А.2: список допустимых
 * значений столбца `brand`) — используется проверкой `BRAND_UNKNOWN` (docs/14-catalog-ingestion.md
 * §14.4 шаг 3). Ключ — каноническая (нормализованная) форма для `_id`/`brand` записи справочника
 * (docs/05-data-model.md §5.3: "нормализованный бренд: `apple`, `samsung`, `xiaomi`"); значение —
 * отображаемое название (`brandTitle`).
 *
 * CSV-схема требует бренд ЛАТИНИЦЕЙ и уже в канонической форме на входе (§А.2) — в отличие от
 * `data/catalog/aliases.json`, который раскрывает РУССКИЕ написания и опечатки пользовательского
 * ввода. Поэтому здесь достаточно точного (без учёта регистра) сопоставления, а не словаря
 * синонимов text-normalizer.
 */
export const KNOWN_BRANDS: ReadonlyMap<string, string> = new Map(
  [
    'Apple',
    'Samsung',
    'Xiaomi',
    'Honor',
    'Huawei',
    'Google',
    'realme',
    'OPPO',
    'OnePlus',
    'vivo',
    'Tecno',
    'Infinix',
    'ZTE',
    'Nothing',
    'Motorola',
    'ASUS',
    'Sony',
    // Встречаются в собранных выгрузках (docs/appendix-a-llm-csv-request.md §А.6) как отдельные
    // бренды, хотя выпускаются в основном под маркой Xiaomi/OPPO — модели указывали их отдельным
    // значением `brand`, а не суб-брендом Xiaomi/OPPO.
    'POCO',
    'Redmi',
    'Nubia',
  ].map((title) => [title.toLowerCase(), title]),
);

export function resolveBrand(rawBrand: string): { readonly brand: string; readonly brandTitle: string } | undefined {
  const normalized = rawBrand.trim().toLowerCase();
  const title = KNOWN_BRANDS.get(normalized);
  if (title === undefined) {
    return undefined;
  }
  return { brand: normalized, brandTitle: title };
}

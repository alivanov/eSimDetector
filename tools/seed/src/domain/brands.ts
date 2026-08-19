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
    // Партия 12 (этап 5.5): Fairphone и HMD/Nokia отсутствовали в списке, хотя прямо названы в
    // §А.2/§А.6 приложения А — без этой записи ВСЕ строки этих брендов уходили в карантин кодом
    // `BRAND_UNKNOWN` (170 строк на прогоне 4 источников). Источники называют бренд по-разному:
    // `hmd`/`HMD` (модели Skyline/Pulse) и отдельно `Nokia` (модели G/X/C-серий) — оставлены
    // ДВУМЯ самостоятельными значениями, а не сведены к одному через `subbrands.json`: в отличие
    // от POCO/Redmi (ADR-029), ни у одного источника нет общего сервисного кода между строками
    // `hmd`+`"Nokia G10"` и `Nokia`+`"G10"`, поэтому автоматическое слияние было бы догадкой по
    // совпадению текста без подтверждения кодом (запрещено тем же принципом, ADR-029).
    'Fairphone',
    'HMD',
    'Nokia',
    // Обнаружено при разборе карантина этапом 5.5, хотя относится к партии 11а (vivo),
    // собранной этапом 4/5.2, а не к новым партиям этого этапа: 89 строк трёх источников из
    // четырёх называют iQOO самостоятельным брендом (`brand: "iQOO"`), а не суб-брендом vivo,
    // хотя запрос партии 11а прямо просил "vivo ... и iQOO" в одном задании (docs/appendix-a
    // §А.6). Тот же принцип, что и для POCO/Redmi/Nubia выше: рыночное название самостоятельное,
    // и большинство источников (3 из 4) указывают его отдельным значением `brand`, а не текстом
    // внутри `marketing_name` бренда vivo — оставлено отдельным известным брендом, а не слито.
    'iQOO',
  ].map((title) => [title.toLowerCase(), title]),
);

export function resolveBrand(
  rawBrand: string,
): { readonly brand: string; readonly brandTitle: string } | undefined {
  const normalized = rawBrand.trim().toLowerCase();
  const title = KNOWN_BRANDS.get(normalized);
  if (title === undefined) {
    return undefined;
  }
  return { brand: normalized, brandTitle: title };
}

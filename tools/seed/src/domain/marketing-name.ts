import type { NormalizationDictionary, QuerySlots } from '@esim-detector/text-normalizer';
import { normalizeQuery } from '@esim-detector/text-normalizer';

export interface MarketingNameSlots {
  readonly family?: string;
  readonly generation?: number;
  readonly modifiers: readonly string[];
  readonly unparsed: readonly string[];
}

/**
 * Разбирает маркетинговое название на слоты ТЕМ ЖЕ КОДОМ, что обрабатывает пользовательский
 * ввод (docs/14-catalog-ingestion.md §14.4 шаг 2; ADR-019) — `@esim-detector/text-normalizer`,
 * без собственной реализации разбора в этом инструменте.
 *
 * Бренд подставляется ПЕРЕД названием (`"${brand} ${marketingName}"`), а не разбирается из
 * одного `marketingName`: `splitBrandAndFamily` (text-normalizer) использует первый словесный
 * токен как кандидата в бренд и склеивает ОСТАЛЬНЫЕ токены в `family` — без бренда впереди
 * первое слово названия (`"Galaxy"`, `"iPhone"`) само стало бы `family`, а `family` осталось
 * бы неверным (докладной пример: `"galaxy s24 ultra"` без бренда даёт `family: "s"`, а
 * `"samsung galaxy s24 ultra"` — корректные `family: "galaxy-s"`, что совпадает с примером
 * docs/05-data-model.md §5.3: `samsung-galaxy-s24-ultra`). Бренд для `_id`/`Device.brand`
 * при этом берётся из столбца CSV (`resolveBrand`), а не из результата этого разбора.
 */
export function parseMarketingNameSlots(
  brand: string,
  marketingName: string,
  dictionary: NormalizationDictionary,
): MarketingNameSlots {
  const { slots }: { slots: QuerySlots } = normalizeQuery(`${brand} ${marketingName}`, dictionary, {
    detectModelCode: false,
  });
  return {
    ...(slots.family !== undefined ? { family: slots.family } : {}),
    ...(slots.generation !== undefined ? { generation: slots.generation } : {}),
    modifiers: slots.modifiers,
    unparsed: slots.unparsed,
  };
}

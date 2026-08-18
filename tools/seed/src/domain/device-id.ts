import type { NormalizationDictionary } from '@esim-detector/text-normalizer';
import {
  collapseWhitespace,
  foldCase,
  normalizeUnicode,
  stripPunctuation,
  tokenize,
  unifySeparators,
} from '@esim-detector/text-normalizer';

/**
 * Строит `_id` записи справочника детерминированно из бренда и маркетингового названия
 * (docs/05-data-model.md §5.3: `samsung-galaxy-s24-ultra`; docs/14-catalog-ingestion.md §14.4
 * шаг 2). В отличие от `parseMarketingNameSlots` (`@esim-detector/text-normalizer`, `parseSlots`),
 * здесь НЕ используется `splitLettersAndDigits`: идентификатор сохраняет исходное сращение
 * буквы и цифры внутри одного слова названия (`"S24"` → `"s24"`, а не `"s"` + `"24"`; `"A54"` →
 * `"a54"`) — это единственный способ детерминированно воспроизвести оба задокументированных
 * примера конвенции буквы `A` (§5.3) одной и той же функцией: `"Galaxy S24 Ultra"` →
 * `"galaxy-s24-ultra"` и `"Galaxy A54"` → `"galaxy-a54"`, хотя в первом случае цифра поколения
 * "приклеена" к семейству (`family: "galaxy-s"`), а во втором — к модификатору-букве
 * (`modifiers: ["a"]`). Реконструкция из отдельных полей `QuerySlots` требовала бы знать, к
 * какому из них была "приклеена" цифра в исходном тексте, а сами слоты этого не сохраняют.
 *
 * Признак сети (`5G` и т. п.) не входит в идентификатор (docs/14 §14.4 шаг 2: "признак сети
 * `5G` — незначимый атрибут") — такие токены удаляются словарём `insignificantAttributes`
 * ДО построения идентификатора, тем же словарём, что и `text-normalizer` (`data/catalog/aliases.json`).
 */
export function buildDeviceId(
  brand: string,
  marketingName: string,
  dictionary: NormalizationDictionary,
): string {
  const withoutDualSimPhrases = removePhrases(
    marketingName,
    dictionary.insignificantAttributes.dualSimMarkers,
  );
  const normalizedText = collapseWhitespace(
    stripPunctuation(unifySeparators(foldCase(normalizeUnicode(withoutDualSimPhrases)))),
  );

  const insignificantTokens = new Set(
    [
      ...dictionary.insignificantAttributes.storagePatterns,
      ...dictionary.insignificantAttributes.colors,
      ...dictionary.insignificantAttributes.networkMarkers,
      ...dictionary.insignificantAttributes.dualSimMarkers,
    ].map((token) => token.toLowerCase()),
  );

  const significantTokens = tokenize(normalizedText).filter(
    (token) => !insignificantTokens.has(token),
  );

  const brandToken = tokenize(collapseWhitespace(stripPunctuation(unifySeparators(foldCase(brand)))));
  return [...brandToken, ...significantTokens].join('-');
}

function removePhrases(text: string, phrases: readonly string[]): string {
  let result = text;
  for (const phrase of phrases) {
    if (phrase.trim().length === 0) {
      continue;
    }
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(escaped, 'gi'), ' ');
  }
  return result;
}

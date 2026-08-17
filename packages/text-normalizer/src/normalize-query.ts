import type {
  NormalizationDictionary,
  NormalizationStepId,
  NormalizationTraceStep,
  NormalizeQueryOptions,
  NormalizedQuery,
  QuerySlots,
} from './types';
import { foldCase, normalizeUnicode, unifyLookalikes } from './unicode';
import { unifySeparators, collapseWhitespace, stripPunctuation } from './separators';
import { splitLettersAndDigits } from './split-letters-digits';
import { correctKeyboardLayout } from './keyboard-layout';
import { transliterateCyrillic } from './transliterate';
import { expandSynonyms, expandCompoundSynonyms } from './synonyms';
import { tokenize } from './tokenize';
import { detectModelCode } from './model-code';
import { parseSlots } from './slots';

/**
 * Полный конвейер обработки пользовательского ввода по схеме docs/04-matching-algorithm.md,
 * §4.3 — от сырой строки до слотового разбора включительно. Каждый шаг нормализации
 * записывается в `trace` для объяснимости (ADR-010).
 *
 * Порядок шагов сознательно отличается от одного места в исходном перечне
 * `NormalizationStepId` (порядок объявления union-типа не задаёт порядок вызова):
 * раскрытие синонимов выполняется РАНЬШЕ транслитерации, а не позже — так требует
 * transliterate.ts (иначе `айфон` превратится в `ajfon` до того, как словарь синонимов
 * успеет его распознать как `iphone`; см. также ADR-018).
 *
 * Составные буквенно-цифровые сокращения словаря (`s23u`, `с23` — docs/04 §4.4, §4.10.1)
 * раскрываются ОТДЕЛЬНЫМ, ЕЩЁ БОЛЕЕ РАННИМ проходом (`expandCompoundSynonyms`) — до
 * `splitLettersAndDigits`, а не вместе с основным проходом `expandSynonyms` ниже по
 * конвейеру: `splitLettersAndDigits` разрушает такой токен на части (`s23u` → `s`/`23`/`u`)
 * раньше, чем токен целиком успевает дойти до словаря, поэтому ключ должен быть раскрыт до
 * этого разрушения. Обычные буквенные синонимы (`нот`, `айфон`) этой проблеме не подвержены
 * и по-прежнему раскрываются основным проходом ниже — см. `synonyms.ts`.
 *
 * Сервисный код модели (docs/04 §4.5) проверяется на исходной строке `raw` ДО общего
 * конвейера: `unifySeparators` и `splitLettersAndDigits` необратимо разрушают структуру
 * кода (`SM-S928B` → `sm s 928 b`), поэтому проверка обязана случиться раньше них.
 */
export function normalizeQuery(
  raw: string,
  dictionary: NormalizationDictionary,
  options?: NormalizeQueryOptions,
): NormalizedQuery {
  const trace: NormalizationTraceStep[] = [];
  const record = (step: NormalizationStepId, input: string, output: string): void => {
    trace.push({ step, input, output, changed: input !== output });
  };

  const afterUnicode = foldCase(normalizeUnicode(raw));
  record('unicode', raw, afterUnicode);

  const afterSeparators = collapseWhitespace(stripPunctuation(unifySeparators(afterUnicode)));
  record('separators', afterUnicode, afterSeparators);

  const preSplitTokens = tokenize(afterSeparators);
  const afterCompoundSynonyms = expandCompoundSynonyms(preSplitTokens, dictionary).join(' ');
  record('compoundSynonyms', afterSeparators, afterCompoundSynonyms);

  const afterSplit = splitLettersAndDigits(afterCompoundSynonyms);
  record('splitLettersAndDigits', afterCompoundSynonyms, afterSplit);

  const afterLookalikes = unifyLookalikes(afterSplit);
  record('lookalikes', afterSplit, afterLookalikes);

  const afterKeyboardLayout = correctKeyboardLayout(afterLookalikes, dictionary);
  record('keyboardLayout', afterLookalikes, afterKeyboardLayout);

  const preSynonymTokens = tokenize(afterKeyboardLayout);
  const expandedTokens = expandSynonyms(preSynonymTokens, dictionary);
  const afterSynonyms = expandedTokens.join(' ');
  record('synonyms', afterKeyboardLayout, afterSynonyms);

  const afterTransliteration = transliterateCyrillic(afterSynonyms, dictionary.transliteration);
  record('transliteration', afterSynonyms, afterTransliteration);

  const tokens = tokenize(afterTransliteration);
  record('tokenize', afterTransliteration, tokens.join(' '));

  const shouldDetectModelCode = options?.detectModelCode ?? true;
  const modelCode = shouldDetectModelCode ? detectModelCode(raw) : undefined;

  const slots: QuerySlots =
    modelCode !== undefined
      ? { modifiers: [], attributes: {}, unparsed: [], modelCode }
      : parseSlots(tokens, dictionary);

  return {
    raw,
    normalized: afterTransliteration,
    tokens,
    attributes: slots.attributes,
    trace,
    slots,
  };
}

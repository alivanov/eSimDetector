import type { EsimReason, EsimSupport } from '@esim-detector/contracts';

/**
 * Детерминированное правило Apple по перечню поколений (docs/09-decisions.md, ADR-013,
 * приоритет 3 «Слияние с курируемым ядром»; docs/14-catalog-ingestion.md, §14.4 шаг 6, п.3):
 * «iPhone XR, XS, XS Max и новее, а также SE 2-го и 3-го поколений поддерживают eSIM;
 * iPhone X и старше — не поддерживают».
 *
 * Вход — те же поля, что и слотовый разбор запроса/запись справочника (docs/05 §5.3):
 * `family`/`generation`/`modifiers`. Модели без числового поколения (`X`, `XS`, `XR`) получают
 * СОБСТВЕННОЕ значение `family` по конвенции text-normalizer (docs/04 §4.5.1: `splitBrandAndFamily`
 * склеивает второй словесный токен в `family` кебабом, если он не цифра и не модификатор
 * линейки) — `"iphone-x"`, `"iphone-xs"`, `"iphone-xr"`; "XS Max" — `family: "iphone-xs"`,
 * `modifiers: ["max"]`, поскольку `"max"` входит в фиксированный словарь модификаторов линейки
 * (docs/04 §4.2). Это правило не занимается разбором названия — оно принимает уже разобранные
 * поля, эту же форму имеет запись справочника (agent 4, курируемое ядро Apple).
 */
export interface AppleModelIdentity {
  readonly family: string;
  readonly generation: number | null;
  readonly modifiers: readonly string[];
}

export interface AppleGenerationRuleResult {
  /** `undefined` — правило не знает эту модель (не iPhone из известного перечня, либо генерация не указана). */
  readonly support: EsimSupport | undefined;
  readonly reason: EsimReason;
}

/** iPhone XS и XR — первые модели с eSIM (2018). */
const ESIM_INTRODUCED_LINES: ReadonlySet<string> = new Set(['iphone-xs', 'iphone-xr']);

/** iPhone X (2017) — eSIM появилась только со следующего поколения, поэтому явное исключение. */
const ESIM_EXCLUDED_LINE = 'iphone-x';

/** iPhone SE, «обычная» числовая линия — граница между поколениями (2-е и новее — с eSIM). */
const SE_MIN_ESIM_GENERATION = 2;

/** Плоская числовая линия `iPhone <N>` (без буквенного суффикса) — 8 и младше без eSIM, 11 и старше — с eSIM. */
const NUMBERED_LINE_MAX_PRE_ESIM_GENERATION = 8;

function resultOf(support: EsimSupport | undefined, reason: EsimReason): AppleGenerationRuleResult {
  return { support, reason };
}

/**
 * Разрешает статус eSIM по перечню поколений Apple. Модификаторы (`pro`/`max`/`plus`) не влияют
 * на результат целиком по построению: eSIM у линейки iPhone — свойство поколения/линии, а не
 * модификатора (все версии `Pro`/`Pro Max` данного поколения имеют одинаковый статус) — поэтому
 * они принимаются в сигнатуре для полноты входа (симметрично `MatcherDevice`/`Device`), но не
 * читаются веткой ниже.
 */
export function resolveAppleGenerationRule(
  identity: AppleModelIdentity,
): AppleGenerationRuleResult {
  if (identity.family === ESIM_EXCLUDED_LINE) {
    return resultOf('not_supported', {
      code: 'APPLE_RULE_NOT_SUPPORTED',
      detail: 'iPhone X старше границы появления eSIM (iPhone XS/XR, 2018)',
    });
  }

  if (ESIM_INTRODUCED_LINES.has(identity.family)) {
    return resultOf('supported', {
      code: 'APPLE_RULE_SUPPORTED',
      detail: `"${identity.family}" входит в перечень линий с eSIM (XS/XR и новее)`,
    });
  }

  if (identity.family === 'iphone-se') {
    if (identity.generation === null) {
      return resultOf(undefined, {
        code: 'APPLE_RULE_UNKNOWN_MODEL',
        detail: 'iPhone SE без номера поколения — 1-е поколение (без eSIM) неотличимо от 2-го/3-го',
      });
    }
    return identity.generation >= SE_MIN_ESIM_GENERATION
      ? resultOf('supported', {
          code: 'APPLE_RULE_SUPPORTED',
          detail: `iPhone SE ${identity.generation}-го поколения — с eSIM`,
        })
      : resultOf('not_supported', {
          code: 'APPLE_RULE_NOT_SUPPORTED',
          detail: 'iPhone SE 1-го поколения — без eSIM',
        });
  }

  if (identity.family === 'iphone') {
    if (identity.generation === null) {
      return resultOf(undefined, {
        code: 'APPLE_RULE_UNKNOWN_MODEL',
        detail: 'iPhone без номера поколения — граница появления eSIM не определена',
      });
    }
    return identity.generation > NUMBERED_LINE_MAX_PRE_ESIM_GENERATION
      ? resultOf('supported', {
          code: 'APPLE_RULE_SUPPORTED',
          detail: `iPhone ${identity.generation} новее границы появления eSIM (XS/XR, 2018)`,
        })
      : resultOf('not_supported', {
          code: 'APPLE_RULE_NOT_SUPPORTED',
          detail: `iPhone ${identity.generation} старше границы появления eSIM (XS/XR, 2018)`,
        });
  }

  return resultOf(undefined, {
    code: 'APPLE_RULE_UNKNOWN_MODEL',
    detail: `Линия "${identity.family}" не входит в известный перечень правила Apple`,
  });
}

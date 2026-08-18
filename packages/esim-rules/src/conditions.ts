import type {
  ConditionResolution,
  EsimCondition,
  EsimInfo,
  EsimReason,
  EsimResolutionContext,
} from '@esim-detector/contracts';

/**
 * Разрешение `esim.support: conditional` (docs/05-data-model.md, §5.4; ADR-007). Поле
 * `conditions` в докe описано как «Исключения» — поэтому конвенция, принятая этим агентом:
 * когда контекста достаточно, чтобы исключить срабатывание ВСЕХ условий записи, результат —
 * `supported` (общий случай, docs/05 §5.4, случай 1: «модели с двумя физическими SIM-слотами
 * не имеют eSIM» — то есть большинство регионов ИМЕЮТ eSIM, а исключение — конкретный регион).
 * Если контекста не хватает хотя бы для одного присутствующего в записи `scope`, вернуть
 * однозначный ответ нельзя — сценарий уточнения (ADR-007), а не догадка (ADR-003).
 *
 * Семантика сравнения по `scope`:
 * - `region` — точное совпадение кода региона (без учёта регистра) с `condition.value`;
 * - `osVersion` — `condition.value` — минимальная версия ОС, начиная с которой имеет смысл
 *   считать это условие НЕ действующим (docs/05 §5.4, случай 4: «eSIM появилась с обновлением
 *   ПО»): условие срабатывает, когда версия контекста СТРОГО МЕНЬШЕ `condition.value`.
 */

function normalizeRegion(region: string): string {
  return region.trim().toUpperCase();
}

/** Сравнение точечных версий ОС (`"15.0"` против `"9.0"`) — числовое посегментно, а не лексикографическое. */
function compareVersionStrings(a: string, b: string): number {
  const segmentsA = a.split('.').map((segment) => Number.parseInt(segment, 10));
  const segmentsB = b.split('.').map((segment) => Number.parseInt(segment, 10));
  const length = Math.max(segmentsA.length, segmentsB.length);

  for (let index = 0; index < length; index += 1) {
    const partA = segmentsA[index] ?? 0;
    const partB = segmentsB[index] ?? 0;
    if (partA !== partB) {
      return partA - partB;
    }
  }
  return 0;
}

interface ConditionMatch {
  readonly condition: EsimCondition;
  readonly reason: EsimReason;
}

/** Правда ли, что контекста достаточно, чтобы проверить условие данного `scope`. */
function hasContextFor(scope: EsimCondition['scope'], context: EsimResolutionContext): boolean {
  if (scope === 'region') {
    return context.region !== undefined;
  }
  return context.osVersion !== undefined;
}

function matchesCondition(condition: EsimCondition, context: EsimResolutionContext): boolean {
  if (condition.scope === 'region') {
    // hasContextFor уже гарантирует context.region !== undefined для вызывающей стороны ниже,
    // но функция самодостаточна и может быть вызвана отдельно — поэтому проверка повторена.
    return (
      context.region !== undefined &&
      normalizeRegion(context.region) === normalizeRegion(condition.value)
    );
  }
  return (
    context.osVersion !== undefined && compareVersionStrings(context.osVersion, condition.value) < 0
  );
}

function findMatch(
  conditions: readonly EsimCondition[],
  context: EsimResolutionContext,
): ConditionMatch | undefined {
  for (const condition of conditions) {
    if (matchesCondition(condition, context)) {
      const code =
        condition.scope === 'region'
          ? 'ESIM_CONDITION_MATCHED_REGION'
          : 'ESIM_CONDITION_MATCHED_OS_VERSION';
      return {
        condition,
        reason: { code, detail: `${condition.scope}=${condition.value}: ${condition.note}` },
      };
    }
  }
  return undefined;
}

/** Есть ли хотя бы одно условие, чей `scope` вызывающая сторона не может проверить контекстом. */
function hasUncheckableScope(
  conditions: readonly EsimCondition[],
  context: EsimResolutionContext,
): boolean {
  return conditions.some((condition) => !hasContextFor(condition.scope, context));
}

/**
 * Разрешает `esim` записи против контекста (docs/05 §5.4, ADR-007). Если `esim.support` уже не
 * `conditional`, условия не рассматриваются — статус берётся из записи напрямую.
 */
export function resolveEsimConditions(
  esim: EsimInfo,
  context: EsimResolutionContext = {},
): ConditionResolution {
  if (esim.support !== 'conditional') {
    return {
      status: esim.support,
      reasons: [{ code: 'ESIM_STATUS_DIRECT', detail: `esim.support = "${esim.support}"` }],
    };
  }

  if (esim.conditions.length === 0) {
    // Защитная ветка: нарушение инварианта §5.8 п.5 (`conditional` без `conditions`) не должно
    // доходить сюда — данные проходят валидацию до попадания в справочник, — но эта функция не
    // предполагает, что вызывающая сторона уже это проверила, и не выбрасывает исключение.
    return {
      status: 'clarification_required',
      reasons: [
        {
          code: 'ESIM_CONDITION_INVALID_CONFIGURATION',
          detail: 'esim.support = "conditional", но esim.conditions пуст',
        },
      ],
      ...(esim.clarifyingQuestion !== null ? { clarification: esim.clarifyingQuestion } : {}),
    };
  }

  const match = findMatch(esim.conditions, context);
  if (match !== undefined) {
    return {
      status: match.condition.support,
      matchedCondition: match.condition,
      reasons: [match.reason],
    };
  }

  if (hasUncheckableScope(esim.conditions, context)) {
    return {
      status: 'clarification_required',
      reasons: [
        {
          code: 'ESIM_CONDITION_CONTEXT_MISSING',
          detail: 'Недостаточно контекста (регион/версия ОС), чтобы исключить региональные условия',
        },
      ],
      ...(esim.clarifyingQuestion !== null ? { clarification: esim.clarifyingQuestion } : {}),
    };
  }

  return {
    status: 'supported',
    reasons: [
      {
        code: 'ESIM_CONDITION_DEFAULT_SUPPORTED',
        detail:
          'Контекст исключил все условия записи — применён проектный default для "conditional"',
      },
    ],
  };
}

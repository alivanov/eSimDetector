import type { MatcherDevice, QuerySlots } from './types';
import { jaroWinklerSimilarity } from './distance/jaro-winkler';

/**
 * Жёсткие ограничения на кандидата (docs/04-matching-algorithm.md, §4.2, §4.6; ADR-020;
 * AGENTS.md, предметное правило 2). `rejectCandidate` выполняется ДО оценки и ранжирования
 * и ИСКЛЮЧАЕТ кандидата целиком, а не понижает его оценку: расстояние между `iPhone 12` и
 * `iPhone 13` равно единице (docs/04 §4.2), поэтому никакая настройка весов не может защитить
 * от ложного сопоставления, если сравнение цифр, модификаторов и однобуквенного обозначения
 * линейки реализовано как составляющая оценки, а не как предикат отбора — только исключение
 * кандидата гарантирует нулевую долю ложных определений независимо от конфигурации (К1, вес
 * 0,40, ADR-003).
 */

export type ConstraintRejectionCode =
  | 'REJECT_BRAND_MISMATCH'
  | 'REJECT_GENERATION_MISMATCH'
  | 'REJECT_MODIFIER_SET_MISMATCH'
  | 'REJECT_LINE_DESIGNATOR_MISMATCH';

export interface ConstraintRejection {
  readonly code: ConstraintRejectionCode;
  readonly deviceId: string;
  /** Короткое техническое пояснение — для трассировки решения (ADR-010), не для пользователя. */
  readonly detail: string;
}

export interface ConstraintOptions {
  /**
   * Минимальная нечёткая схожесть (мера Джаро—Винклера) между брендом запроса и брендом ЛИБО
   * семейством устройства, ниже которой кандидат исключается. Порог, а не точное равенство,
   * потому что `slots.brand` — результат позиционной эвристики `text-normalizer`, а не поиска
   * по справочнику брендов (ADR-019): для `iphone 15 pro` `slots.brand === 'iphone'`, тогда как
   * `device.brand === 'apple'` — сравнение только с `device.brand` ложно отклонило бы весь модельный
   * ряд Apple, поэтому проверяется схожесть также и с `device.family` (см. `computeBrandSimilarity`).
   * По умолчанию `0.5` — отсекает явно другой бренд (`xiaomi` vs `apple`), но не типографскую опечатку.
   */
  readonly minBrandSimilarity?: number;
}

const DEFAULT_MIN_BRAND_SIMILARITY = 0.5;

/**
 * Нечёткая схожесть бренда запроса с устройством — максимум схожести с `device.brand` и с
 * `device.family` (см. пояснение в `ConstraintOptions.minBrandSimilarity`). `undefined`, когда
 * бренд в запросе не распознан — в этом случае ограничение неприменимо (симметрично поколению).
 * Экспортируется, чтобы `scoring.ts` мог использовать ТУ ЖЕ величину для разбивки оценки
 * (ADR-010), не пересчитывая её по-другому.
 */
export function computeBrandSimilarity(
  slots: QuerySlots,
  device: MatcherDevice,
): number | undefined {
  if (slots.brand === undefined) {
    return undefined;
  }
  return Math.max(
    jaroWinklerSimilarity(slots.brand, device.brand),
    jaroWinklerSimilarity(slots.brand, device.family),
  );
}

function checkBrand(
  slots: QuerySlots,
  device: MatcherDevice,
  minBrandSimilarity: number,
): ConstraintRejection | null {
  const similarity = computeBrandSimilarity(slots, device);
  if (similarity === undefined) {
    return null;
  }
  if (similarity < minBrandSimilarity) {
    return {
      code: 'REJECT_BRAND_MISMATCH',
      deviceId: device.id,
      detail: `бренд запроса "${slots.brand ?? ''}" не похож на "${device.brand}"/"${device.family}" (схожесть ${similarity.toFixed(2)} < ${minBrandSimilarity})`,
    };
  }
  return null;
}

/**
 * Точное сравнение номера поколения (docs/04 §4.2). Отсутствие номера в запросе ограничение
 * не применяет — пользователь мог не указать поколение вовсе, это не повод отклонять кандидата.
 * Номер в запросе при `generation: null` у устройства (модель без применимого поколения,
 * docs/05 §5.3) — всегда отклонение, поскольку сравнивать в этом случае не с чем.
 */
function checkGeneration(slots: QuerySlots, device: MatcherDevice): ConstraintRejection | null {
  if (slots.generation === undefined) {
    return null;
  }
  if (device.generation === null || device.generation !== slots.generation) {
    return {
      code: 'REJECT_GENERATION_MISMATCH',
      deviceId: device.id,
      detail: `поколение запроса ${slots.generation} не равно поколению устройства ${String(device.generation)}`,
    };
  }
  return null;
}

function sameModifierSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  const bSet = new Set(b);
  return a.every((modifier) => bSet.has(modifier));
}

/**
 * Точное сравнение набора модификаторов линейки (docs/04 §4.2) КАК МНОЖЕСТВА: лишний и
 * отсутствующий модификатор равнозначны — `["pro"]` не равно `["pro","max"]` ни в одну, ни
 * в другую сторону.
 *
 * Ограничение применяется, ТОЛЬКО когда запрос явно называет хотя бы один модификатор.
 * Если пользователь не упомянул модификатор вовсе (`slots.modifiers` пуст, например запрос
 * `galaxy s23` без уточнения), ограничение не применяется намеренно: иначе из кандидатов
 * `S23`/`S23+`/`S23 Ultra`/`S23 FE` выжила бы только базовая модель — единственная с пустым
 * набором модификаторов — и запрос молча резолвился бы в неё, что прямо запрещено docs/04 §4.7
 * (правило разрыва: такой запрос обязан давать `clarification_required`, а не тихий выбор
 * базовой модели). Симметрично правилу для поколения: отсутствие информации в запросе — не
 * повод отклонять кандидата. Обратный случай — запрос ЯВНО называет модификатор (`S23 FE`,
 * `["fe"]`) — по-прежнему отклоняет кандидата с другим набором (`S23`, `[]`), что и требуется
 * тестом на невозможность ложного результата (`impossible-matches.spec.ts`: `S23` ≠ `S23 FE`).
 */
function checkModifierSet(slots: QuerySlots, device: MatcherDevice): ConstraintRejection | null {
  if (slots.modifiers.length === 0) {
    return null;
  }
  if (!sameModifierSet(slots.modifiers, device.modifiers)) {
    return {
      code: 'REJECT_MODIFIER_SET_MISMATCH',
      deviceId: device.id,
      detail: `модификаторы запроса [${slots.modifiers.join(', ')}] не равны модификаторам устройства [${device.modifiers.join(', ')}]`,
    };
  }
  return null;
}

function sameStringSet(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) {
    return false;
  }
  for (const value of a) {
    if (!b.has(value)) {
      return false;
    }
  }
  return true;
}

/**
 * Однобуквенное обозначение линейки (docs/04 §4.2): однобуквенные сегменты `family` после
 * первого плюс однобуквенные `modifiers`. A-серия хранится как `family: "galaxy"` +
 * `modifiers: ["a"]`, S/M/Z — как последний сегмент `galaxy-s` / `galaxy-m` / `galaxy-z`; без
 * сбора из обоих источников A и S остались бы неразличимы. Многобуквенный сегмент (`note`,
 * `core`, `edition`) обозначением не считается.
 *
 * Первый сегмент по умолчанию пропускается (якорь семейства в справочнике). Два исключения,
 * когда имя семейства заняло `brand` и в `family` остались только обозначения:
 * - `family` целиком из одной буквы (`галакси с23` → `s`);
 * - первый сегмент — буква, и дальше есть ещё буква (`Galaxy M01s` → `m-s`, не `{s}`).
 * Иначе предлог в «погода в москве» (`v-moskve`) стал бы ложным обозначением `{v}`.
 */
function lineDesignators(
  family: string | undefined,
  modifiers: readonly string[],
): ReadonlySet<string> {
  const designators = new Set<string>();
  if (family !== undefined && family.length > 0) {
    for (const segment of familyDesignatorSegments(family)) {
      designators.add(segment);
    }
  }
  for (const modifier of modifiers) {
    if (modifier.length === 1) {
      designators.add(modifier);
    }
  }
  return designators;
}

function familyDesignatorSegments(family: string): readonly string[] {
  const [first = '', ...afterFirst] = family.split('-');
  if (afterFirst.length === 0) {
    return first.length === 1 ? [first] : [];
  }
  const singleAfterFirst = afterFirst.filter((segment) => segment.length === 1);
  if (first.length === 1 && singleAfterFirst.length > 0) {
    return [first, ...singleAfterFirst];
  }
  return singleAfterFirst;
}

function formatDesignators(designators: ReadonlySet<string>): string {
  return [...designators].join(', ');
}

/**
 * Точное сравнение однобуквенного обозначения линейки. Ограничение применяется, ТОЛЬКО когда
 * запрос назвал хотя бы одно такое обозначение — симметрично поколению и набору модификаторов.
 * Если запрос назвал обозначение, а у устройства оно другое либо отсутствует — отклонение
 * (ADR-020: исключение кандидата, а не понижение оценки).
 */
function checkLineDesignator(slots: QuerySlots, device: MatcherDevice): ConstraintRejection | null {
  const queryDesignators = lineDesignators(slots.family, slots.modifiers);
  if (queryDesignators.size === 0) {
    return null;
  }
  const deviceDesignators = lineDesignators(device.family, device.modifiers);
  if (sameStringSet(queryDesignators, deviceDesignators)) {
    return null;
  }
  return {
    code: 'REJECT_LINE_DESIGNATOR_MISMATCH',
    deviceId: device.id,
    detail: `обозначение линейки запроса {${formatDesignators(queryDesignators)}} не равно обозначению устройства {${formatDesignators(deviceDesignators)}}`,
  };
}

/**
 * Предикат отбора кандидата (ADR-020): возвращает причину отклонения либо `null`, если ни
 * одно жёсткое ограничение не сработало. Порядок проверок не влияет на корректность (ограничения
 * независимы), но фиксирован для детерминированности кода причины при нескольких одновременных
 * нарушениях.
 */
export function rejectCandidate(
  slots: QuerySlots,
  device: MatcherDevice,
  options: ConstraintOptions = {},
): ConstraintRejection | null {
  const minBrandSimilarity = options.minBrandSimilarity ?? DEFAULT_MIN_BRAND_SIMILARITY;

  return (
    checkBrand(slots, device, minBrandSimilarity) ??
    checkGeneration(slots, device) ??
    checkModifierSet(slots, device) ??
    checkLineDesignator(slots, device)
  );
}

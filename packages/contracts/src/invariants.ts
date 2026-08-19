import type { Device } from './device.schema';
import type { ScreenSignatureRecord } from './screen-signature.schema';

/**
 * Проверка семи инвариантов справочника (docs/05-data-model.md, §5.8) — пригодна и для CI по
 * файлам `data/catalog/` (агент 4, до импорта), и для проверки перед загрузкой в MongoDB
 * (`CatalogModule.onModuleInit`, агент 3): в обоих случаях вход — уже разобранные (`deviceSchema.parse`)
 * записи, а не сырые данные, поэтому функция ничего не знает о формате CSV/JSON на диске.
 *
 * Каждая проверка собирает ВСЕ нарушения, а не останавливается на первом — иначе отчёт об
 * импорте (docs/14 §14.6) увидел бы только одно нарушение за прогон.
 */

export type CatalogInvariantNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type CatalogInvariantCode =
  | 'DUPLICATE_DEVICE_ID'
  | 'DUPLICATE_MODEL_CODE'
  | 'CONFLICTING_ALIAS'
  | 'IOS_SCREEN_SIGNATURES_MISSING'
  | 'IOS_MAX_VERSION_MISSING'
  | 'CONDITIONAL_CONDITIONS_MISSING'
  | 'CONDITIONAL_CLARIFYING_QUESTION_MISSING'
  | 'SUPPORTED_SOURCES_MISSING'
  | 'SCREEN_SIGNATURE_CONSENSUS_MISMATCH'
  | 'SCREEN_SIGNATURE_UNKNOWN_CANDIDATE';

export interface CatalogInvariantViolation {
  readonly invariant: CatalogInvariantNumber;
  readonly code: CatalogInvariantCode;
  readonly deviceId?: string;
  /**
   * Все устройства, затронутые ПАРНЫМ нарушением (инварианты 2 и 3 — один код/псевдоним у
   * нескольких разных записей): заполнено для `DUPLICATE_MODEL_CODE`/`CONFLICTING_ALIAS`, чтобы
   * вызывающая сторона могла отправить в карантин ОБЕ (или все) записи пары, а не только одну
   * (docs/09-decisions.md ADR-029: "нарушение инварианта карантинит запись, а не отменяет
   * справочник целиком" — карантин обеих сторон конфликта, симметрично `CODE_COLLISION`,
   * docs/14-catalog-ingestion.md §14.3). Для остальных инвариантов (одно устройство на нарушение)
   * не заполняется — достаточно `deviceId`.
   */
  readonly deviceIds?: readonly string[];
  readonly message: string;
}

export interface CatalogValidationResult {
  readonly valid: boolean;
  readonly violations: readonly CatalogInvariantViolation[];
}

/** Инвариант 1 (частично): уникальность `_id` — соответствие схеме проверяется до вызова этой функции `deviceSchema.parse`. */
function checkUniqueDeviceIds(devices: readonly Device[]): CatalogInvariantViolation[] {
  const seen = new Map<string, number>();
  for (const device of devices) {
    seen.set(device._id, (seen.get(device._id) ?? 0) + 1);
  }
  const violations: CatalogInvariantViolation[] = [];
  for (const [id, count] of seen) {
    if (count > 1) {
      violations.push({
        invariant: 1,
        code: 'DUPLICATE_DEVICE_ID',
        deviceId: id,
        message: `Идентификатор "${id}" встречается ${count} раз(а) — обязана быть ровно одна запись`,
      });
    }
  }
  return violations;
}

/** Инвариант 2: уникальность каждого сервисного кода в пределах всего справочника. */
function checkUniqueModelCodes(devices: readonly Device[]): CatalogInvariantViolation[] {
  const ownerByCode = new Map<string, string>();
  const violations: CatalogInvariantViolation[] = [];
  for (const device of devices) {
    for (const code of device.modelCodes) {
      const normalizedCode = code.toUpperCase();
      const owner = ownerByCode.get(normalizedCode);
      if (owner === undefined) {
        ownerByCode.set(normalizedCode, device._id);
      } else if (owner !== device._id) {
        violations.push({
          invariant: 2,
          code: 'DUPLICATE_MODEL_CODE',
          deviceId: device._id,
          deviceIds: [owner, device._id],
          message: `Сервисный код "${code}" принадлежит одновременно "${owner}" и "${device._id}"`,
        });
      }
    }
  }
  return violations;
}

/**
 * Инвариант 3: один псевдоним не указывает на разные устройства с разным статусом eSIM.
 * Один и тот же псевдоним у нескольких устройств С ОДИНАКОВЫМ статусом — не нарушение
 * (например, объединённые записи 4G/5G одной модели, docs/14 §14.4, шаг 2) — конфликт
 * возникает только когда статус реально расходится, что и было бы ложным ответом (К1).
 *
 * `marketingName` участвует в проверке ТОЛЬКО когда `family !== brand` — то есть когда в
 * названии есть собственное словесное содержание помимо самого бренда (`"Redmi Note"`,
 * `"Galaxy S24 Ultra"`). Найдено этапом 5.5 (docs/09 ADR-024/029, партия 5): по правилу
 * приложения А §А.2 `marketing_name` пишется БЕЗ бренда, а у ряда вендоров (Xiaomi с 2022 года,
 * OnePlus, iQOO, realme) официальное название флагмана — чистое число без единого слова
 * (`"12"`, `"13 Pro"`); `family` в этом случае равен `brand` (слотовый разбор не нашёл ничего
 * своего, кроме подставленного бренда). Такое `marketingName` заведомо не уникально МЕЖДУ
 * брендами — разные вендоры массово переиспользуют одни и те же номера поколений
 * (`OnePlus 12`, `Xiaomi 12`, `iQOO 12` — три разных телефона одного года). Проверка этого
 * поля буквально как псевдонима превращала бы ЛЮБОЕ совпадение номера поколения между
 * любыми двумя брендами в карантин ОБЕИХ записей целиком (ADR-029 п.2) — включая курируемые
 * записи Apple, если один из совпавших номеров попадал в их собственный список псевдонимов
 * (`"12 pro"` у `apple-iphone-12-pro`). Настоящий (записанный явно в `aliases`) псевдоним
 * такую защиту не получает и продолжает участвовать в проверке всегда — редкий сознательный
 * ввод короткой формы (как у Apple) — это утверждение о РЕАЛЬНОЙ узнаваемости, а не побочный
 * продукт схемы CSV.
 */
function checkAliasConflicts(devices: readonly Device[]): CatalogInvariantViolation[] {
  const statusesByAlias = new Map<string, Map<string, string>>();
  for (const device of devices) {
    const marketingNameCarriesOwnWord = device.family !== device.brand;
    const aliasesAndNames = marketingNameCarriesOwnWord
      ? [...device.aliases, device.marketingName]
      : [...device.aliases];
    for (const alias of aliasesAndNames) {
      const normalizedAlias = alias.trim().toLowerCase();
      const bucket = statusesByAlias.get(normalizedAlias) ?? new Map<string, string>();
      bucket.set(device._id, device.esim.support);
      statusesByAlias.set(normalizedAlias, bucket);
    }
  }

  const violations: CatalogInvariantViolation[] = [];
  for (const [alias, ownersToStatus] of statusesByAlias) {
    const distinctStatuses = new Set(ownersToStatus.values());
    if (distinctStatuses.size > 1) {
      const deviceIds = [...ownersToStatus.keys()];
      violations.push({
        invariant: 3,
        code: 'CONFLICTING_ALIAS',
        deviceIds,
        message: `Псевдоним "${alias}" указывает на устройства с разным статусом eSIM: ${deviceIds.join(', ')}`,
      });
    }
  }
  return violations;
}

/** Инвариант 4: для `platform: ios` — заполненные `screenSignatures` и `os.maxVersion`. */
function checkIosFieldsPresent(device: Device): CatalogInvariantViolation[] {
  if (device.platform !== 'ios') {
    return [];
  }
  const violations: CatalogInvariantViolation[] = [];
  if (device.screenSignatures.length === 0) {
    violations.push({
      invariant: 4,
      code: 'IOS_SCREEN_SIGNATURES_MISSING',
      deviceId: device._id,
      message: `Устройство "${device._id}" на платформе iOS без сигнатур экрана`,
    });
  }
  if (device.os.maxVersion === null) {
    violations.push({
      invariant: 4,
      code: 'IOS_MAX_VERSION_MISSING',
      deviceId: device._id,
      message: `Устройство "${device._id}" на платформе iOS без "os.maxVersion"`,
    });
  }
  return violations;
}

/** Инвариант 5: для `esim.support: conditional` — непустые `conditions` и заполненный `clarifyingQuestion`. */
function checkConditionalFieldsPresent(device: Device): CatalogInvariantViolation[] {
  if (device.esim.support !== 'conditional') {
    return [];
  }
  const violations: CatalogInvariantViolation[] = [];
  if (device.esim.conditions.length === 0) {
    violations.push({
      invariant: 5,
      code: 'CONDITIONAL_CONDITIONS_MISSING',
      deviceId: device._id,
      message: `Устройство "${device._id}" со статусом "conditional" без "esim.conditions"`,
    });
  }
  if (device.esim.clarifyingQuestion === null) {
    violations.push({
      invariant: 5,
      code: 'CONDITIONAL_CLARIFYING_QUESTION_MISSING',
      deviceId: device._id,
      message: `Устройство "${device._id}" со статусом "conditional" без "esim.clarifyingQuestion"`,
    });
  }
  return violations;
}

/**
 * Инвариант 6 (docs/05-data-model.md §5.8, п.6; .cursor/rules/catalog-data.mdc): статус
 * `esim.support: supported` с уровнем достоверности `verified` требует непустого `sources`. Без
 * ссылки на источник запись не может подниматься выше `derived` (docs/09-decisions.md ADR-029) —
 * поэтому нарушение возникает ТОЛЬКО при сочетании `supported` И `dataConfidence: "verified"`, а
 * не при любом `supported` без источника.
 *
 * До ADR-029 проверка блокировала любую запись `supported` без `sources` независимо от уровня
 * достоверности — это была ошибка реализации, а не более строгое требование: выгрузки языковых
 * моделей запрашивались с выключенным веб-поиском (docs/appendix-a §А.1, правило 5), поэтому
 * пустой `source_url` у записей уровня `derived`/`unverified` — ожидаемое, документированное
 * состояние конвейера (`SOURCE_MISSING`, docs/14 §14.3: "уровень достоверности не выше `derived`"),
 * а не дефект данных, который стоило бы карантинить.
 */
function checkSupportedHasSources(device: Device): CatalogInvariantViolation[] {
  if (device.esim.support !== 'supported' || device.dataConfidence !== 'verified') {
    return [];
  }
  if (device.sources.length === 0) {
    return [
      {
        invariant: 6,
        code: 'SUPPORTED_SOURCES_MISSING',
        deviceId: device._id,
        message: `Устройство "${device._id}" со статусом "supported" и достоверностью "verified" без "sources"`,
      },
    ];
  }
  return [];
}

/** Инвариант 7: согласованность `screen_signatures.esimConsensus` с записями устройств-кандидатов. */
function checkScreenSignatureConsensus(
  devicesById: ReadonlyMap<string, Device>,
  screenSignatures: readonly ScreenSignatureRecord[],
): CatalogInvariantViolation[] {
  const violations: CatalogInvariantViolation[] = [];

  for (const record of screenSignatures) {
    const candidateStatuses: string[] = [];
    for (const candidateId of record.candidates) {
      const candidate = devicesById.get(candidateId);
      if (candidate === undefined) {
        violations.push({
          invariant: 7,
          code: 'SCREEN_SIGNATURE_UNKNOWN_CANDIDATE',
          deviceId: candidateId,
          message: `Сигнатура "${record.signature}" ссылается на неизвестное устройство "${candidateId}"`,
        });
        continue;
      }
      candidateStatuses.push(candidate.esim.support);
    }

    if (candidateStatuses.length === 0) {
      continue;
    }

    const distinctStatuses = new Set(candidateStatuses);
    const [firstStatus] = candidateStatuses;
    const expectedConsensus =
      distinctStatuses.size === 1 && firstStatus !== undefined ? firstStatus : 'mixed';

    if (expectedConsensus !== record.esimConsensus) {
      violations.push({
        invariant: 7,
        code: 'SCREEN_SIGNATURE_CONSENSUS_MISMATCH',
        message: `Сигнатура "${record.signature}": заявлено "${record.esimConsensus}", по кандидатам ожидается "${expectedConsensus}"`,
      });
    }
  }

  return violations;
}

/**
 * Проверяет все семь инвариантов §5.8 на переданном наборе записей. `screenSignatures` не
 * обязателен (пуст по умолчанию) — инвариант 7 неприменим, пока коллекция не построена
 * (`tools/seed rebuild-signatures`, агент 4); на пустом справочнике (задача агента 3 —
 * работать корректно без данных) функция также возвращает `valid: true`.
 */
export function validateCatalogInvariants(
  devices: readonly Device[],
  screenSignatures: readonly ScreenSignatureRecord[] = [],
): CatalogValidationResult {
  const devicesById = new Map(devices.map((device) => [device._id, device]));

  const violations: CatalogInvariantViolation[] = [
    ...checkUniqueDeviceIds(devices),
    ...checkUniqueModelCodes(devices),
    ...checkAliasConflicts(devices),
    ...devices.flatMap(checkIosFieldsPresent),
    ...devices.flatMap(checkConditionalFieldsPresent),
    ...devices.flatMap(checkSupportedHasSources),
    ...checkScreenSignatureConsensus(devicesById, screenSignatures),
  ];

  return { valid: violations.length === 0, violations };
}

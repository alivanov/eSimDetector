import type { NormalizationDictionary } from '@esim-detector/text-normalizer';
import { normalizeQuery } from '@esim-detector/text-normalizer';

import type { DevicesCsvRow } from '../csv/types';
import { resolveBrand } from './brands';
import type { CodePatternMap } from './code-patterns';
import { validateModelCode } from './code-patterns';
import { buildDeviceId } from './device-id';
import { parseEsimConditions } from './esim-conditions';
import { parseMarketingNameSlots } from './marketing-name';
import { extractMajorVersion, type OsVersionCeilings } from './os-version-ceiling';
import type {
  CsvEsimSupport,
  DeviceCandidate,
  QuarantineCode,
  RowNotice,
  RowProvenance,
  ValidateRowResult,
} from './types';

const PLATFORM_VALUES = ['ios', 'android', 'harmonyos', 'other'] as const;
const DEVICE_TYPE_VALUES = ['phone', 'tablet', 'watch', 'laptop', 'other'] as const;
const ESIM_SUPPORT_VALUES = ['yes', 'no', 'conditional', 'unknown'] as const;
const DUAL_SIM_VALUES = ['physical+esim', 'dual-esim', 'esim-only', 'none', 'unknown'] as const;
const RU_MARKET_VALUES = ['official', 'parallel', 'none', 'unknown'] as const;
const CONFIDENCE_VALUES = ['high', 'medium', 'low'] as const;

/** eSIM массово появилась в 2017–2018 годах (docs/14 §14.4 шаг 3: проверка `ESIM_ANACHRONISM`). */
const ESIM_ANACHRONISM_YEAR = 2017;

function isOneOf<T extends string>(value: string, allowed: readonly T[]): value is T {
  return allowed.some((candidate) => candidate === value);
}

export interface ValidateRowContext {
  readonly source: string;
  readonly batchId: string;
  readonly lineNumber: number;
  readonly now: Date;
  readonly dictionary: NormalizationDictionary;
  readonly codePatterns: CodePatternMap;
  readonly osVersionCeilings: OsVersionCeilings;
}

function quarantine(
  code: QuarantineCode,
  context: ValidateRowContext,
  detail: string,
  row: DevicesCsvRow,
): ValidateRowResult {
  return {
    quarantine: {
      code,
      source: context.source,
      batchId: context.batchId,
      lineNumber: context.lineNumber,
      detail,
      ...(row.brand !== undefined ? { rawBrand: row.brand } : {}),
      ...(row.marketingName !== undefined ? { rawMarketingName: row.marketingName } : {}),
    },
    notices: [],
  };
}

/**
 * Валидация одной строки `devices.csv` (docs/14-catalog-ingestion.md §14.4 шаг 3, таблица
 * стабильных кодов проверок). Коллизии кодов и названий (`CODE_COLLISION`/`NAME_COLLISION_CONFLICT`)
 * требуют сравнения МЕЖДУ строками одного источника — не проверяются здесь (`collisions.ts`).
 */
export function validateRow(row: DevicesCsvRow, context: ValidateRowContext): ValidateRowResult {
  const rawPlatform = row.platform?.trim().toLowerCase() ?? '';
  const rawDeviceType = row.deviceType?.trim().toLowerCase() ?? '';
  const rawEsimSupport = row.esimSupport?.trim().toLowerCase() ?? '';

  if (!isOneOf(rawPlatform, PLATFORM_VALUES)) {
    return quarantine(
      'ENUM_INVALID',
      context,
      `platform="${row.platform ?? ''}" вне допустимого набора`,
      row,
    );
  }
  if (!isOneOf(rawDeviceType, DEVICE_TYPE_VALUES)) {
    return quarantine(
      'ENUM_INVALID',
      context,
      `device_type="${row.deviceType ?? ''}" вне допустимого набора`,
      row,
    );
  }
  if (!isOneOf(rawEsimSupport, ESIM_SUPPORT_VALUES)) {
    return quarantine(
      'ENUM_INVALID',
      context,
      `esim_support="${row.esimSupport ?? ''}" вне допустимого набора`,
      row,
    );
  }
  if (row.dualSim !== undefined && !isOneOf(row.dualSim.trim().toLowerCase(), DUAL_SIM_VALUES)) {
    return quarantine(
      'ENUM_INVALID',
      context,
      `dual_sim="${row.dualSim}" вне допустимого набора`,
      row,
    );
  }
  if (row.ruMarket !== undefined && !isOneOf(row.ruMarket.trim().toLowerCase(), RU_MARKET_VALUES)) {
    return quarantine(
      'ENUM_INVALID',
      context,
      `ru_market="${row.ruMarket}" вне допустимого набора`,
      row,
    );
  }
  if (
    row.confidence !== undefined &&
    !isOneOf(row.confidence.trim().toLowerCase(), CONFIDENCE_VALUES)
  ) {
    return quarantine(
      'ENUM_INVALID',
      context,
      `confidence="${row.confidence}" вне допустимого набора`,
      row,
    );
  }

  const resolvedBrand = row.brand !== undefined ? resolveBrand(row.brand) : undefined;
  if (resolvedBrand === undefined) {
    return quarantine(
      'BRAND_UNKNOWN',
      context,
      `Бренд "${row.brand ?? ''}" не найден в словаре известных`,
      row,
    );
  }

  if (row.marketingName === undefined || row.marketingName.trim().length === 0) {
    return quarantine('NAME_UNPARSEABLE', context, 'marketing_name пуст', row);
  }
  // Проверка "разбирается ли название само по себе" выполняется БЕЗ бренда впереди — но
  // отсутствие СЛОВЕСНОГО токена (`family === undefined`) само по себе не признак мусора:
  // у части вендоров официальное название флагмана — ЧИСТОЕ число без единого слова (`Xiaomi 12`,
  // `Xiaomi 13 Ultra` — по правилу А.2 marketing_name пишется БЕЗ бренда, а бренд "Xiaomi" и есть
  // единственное словесное отличие от простого числа). До этапа 5.5 таких строк в собранных
  // выгрузках не было (Mi 9…Mi 11 всегда содержат словесный токен "Mi"), поэтому дефект не
  // проявлялся; партия 5 (флагманы Xiaomi) впервые дала 36 таких строк с одним источником каждая,
  // и все они уходили в карантин, хотя `generation`/`modifiers` разобраны верно и `parseMarketingNameSlots`
  // ниже (С брендом) успешно определил бы `family` от слова "xiaomi". Мусором признаётся только
  // название, где НИЧЕГО не разобралось вовсе — ни слово, ни поколение, ни модификатор линейки
  // (пунктуация, эмодзи, случайные символы: `★ ??? ★`, docs/14 §14.3 `NAME_UNPARSEABLE`).
  const aloneSlots = normalizeQuery(row.marketingName, context.dictionary, {
    detectModelCode: false,
  }).slots;
  const hasAnyParsedSignal =
    aloneSlots.family !== undefined ||
    aloneSlots.generation !== undefined ||
    aloneSlots.modifiers.length > 0;
  if (!hasAnyParsedSignal) {
    return quarantine(
      'NAME_UNPARSEABLE',
      context,
      `Название "${row.marketingName}" не содержит ни одного словесного токена, поколения или модификатора линейки`,
      row,
    );
  }
  const slots = parseMarketingNameSlots(resolvedBrand.brand, row.marketingName, context.dictionary);
  const family = slots.family;
  if (family === undefined) {
    // Защитная ветка: бренд сам по себе — словесный токен, и `splitBrandAndFamily` в
    // text-normalizer при единственном словесном токене отдаёт его сразу в оба поля (`brand` и
    // `family`), поэтому `family` не может остаться неопределённым после того, как бренд
    // подставлен впереди строки, — но компилятор об этом не знает, а ADR-016 запрещает `as`/`!`
    // для сужения типа внешних данных.
    return quarantine(
      'NAME_UNPARSEABLE',
      context,
      `Название "${row.marketingName}" не разбирается на family даже с брендом`,
      row,
    );
  }

  const releaseYear = row.releaseYear !== undefined ? Number.parseInt(row.releaseYear, 10) : NaN;
  const maxPlausibleYear = context.now.getUTCFullYear() + 1;
  if (!Number.isInteger(releaseYear) || releaseYear < 2007 || releaseYear > maxPlausibleYear) {
    return quarantine(
      'YEAR_IMPLAUSIBLE',
      context,
      `release_year="${row.releaseYear ?? ''}" вне диапазона 2007…${maxPlausibleYear}`,
      row,
    );
  }

  const esimSupport: CsvEsimSupport = rawEsimSupport;
  if (
    releaseYear < ESIM_ANACHRONISM_YEAR &&
    (esimSupport === 'yes' || esimSupport === 'conditional')
  ) {
    return quarantine(
      'ESIM_ANACHRONISM',
      context,
      `esim_support="${esimSupport}" у устройства ${releaseYear} года — до массового появления eSIM (2017)`,
      row,
    );
  }

  const notices: RowNotice[] = [];
  const id = buildDeviceId(resolvedBrand.brand, row.marketingName, context.dictionary);

  // Канонический разделитель в приложении А — `|`; фактические выгрузки LLM часто
  // ставят `;` (то же, что для пар esim_conditions). Оба принимаются — иначе вся
  // склейка «ADY-AL00;ADY-LX9» отбрасывается целиком как один CODE_PATTERN_INVALID.
  const rawCodes =
    row.modelCodes !== undefined
      ? row.modelCodes
          .split(/[|;]/)
          .map((code) => code.trim())
          .filter((code) => code.length > 0)
      : [];
  const validCodes: string[] = [];
  for (const code of rawCodes) {
    const validation = validateModelCode(resolvedBrand.brand, code, context.codePatterns);
    if (validation.valid === false) {
      notices.push({
        code: 'CODE_PATTERN_INVALID',
        deviceId: id,
        detail: `Код "${code}" не соответствует шаблону бренда "${resolvedBrand.brand}" — отброшен`,
      });
      continue;
    }
    validCodes.push(code);
  }

  const { conditions, droppedCount } = parseEsimConditions(row.esimConditions);
  if (esimSupport === 'conditional' && conditions.length === 0) {
    return quarantine(
      'CONDITION_SYNTAX_INVALID',
      context,
      droppedCount > 0
        ? 'esim_support="conditional", но ни одна пара esim_conditions не разобралась'
        : 'esim_support="conditional", но esim_conditions пусто',
      row,
    );
  }

  if (rawPlatform === 'android' && row.osMaxVersion !== undefined) {
    const majorVersion = extractMajorVersion(row.osMaxVersion);
    if (majorVersion !== undefined && majorVersion > context.osVersionCeilings.android) {
      notices.push({
        code: 'OS_VERSION_IMPLAUSIBLE',
        deviceId: id,
        detail: `os_max_version="${row.osMaxVersion}" выше потолка ${context.osVersionCeilings.android} — отброшено`,
      });
    }
  }

  const provenance: RowProvenance = {
    source: context.source,
    batchId: context.batchId,
    importedAt: context.now,
    lineNumber: context.lineNumber,
  };

  const maxEsimProfiles =
    row.maxEsimProfiles !== undefined ? Number.parseInt(row.maxEsimProfiles, 10) : undefined;
  const normalizedConfidence = row.confidence?.trim().toLowerCase();
  const confidenceSelfReported =
    normalizedConfidence !== undefined && isOneOf(normalizedConfidence, CONFIDENCE_VALUES)
      ? normalizedConfidence
      : undefined;

  const osMaxVersionKept =
    row.osMaxVersion !== undefined &&
    !notices.some((notice) => notice.code === 'OS_VERSION_IMPLAUSIBLE')
      ? row.osMaxVersion
      : undefined;

  const candidate: DeviceCandidate = {
    id,
    brand: resolvedBrand.brand,
    brandTitle: resolvedBrand.brandTitle,
    marketingName: row.marketingName.trim(),
    family,
    generation: slots.generation ?? null,
    modifiers: slots.modifiers,
    modelCodes: validCodes,
    platform: rawPlatform,
    deviceType: rawDeviceType,
    releaseYear,
    esimSupport,
    esimConditions: conditions,
    ...(row.dualSim !== undefined ? { dualSim: row.dualSim.trim().toLowerCase() } : {}),
    ...(maxEsimProfiles !== undefined && Number.isFinite(maxEsimProfiles)
      ? { maxEsimProfiles }
      : {}),
    ...(row.osMinVersion !== undefined ? { osMinVersion: row.osMinVersion } : {}),
    ...(osMaxVersionKept !== undefined ? { osMaxVersion: osMaxVersionKept } : {}),
    ...(row.ruMarket !== undefined ? { ruMarket: row.ruMarket.trim().toLowerCase() } : {}),
    ...(row.sourceUrl !== undefined && row.sourceUrl.trim().length > 0
      ? { sourceUrl: row.sourceUrl.trim() }
      : {}),
    ...(confidenceSelfReported !== undefined ? { confidenceSelfReported } : {}),
    ...(row.notes !== undefined && row.notes.trim().length > 0 ? { notes: row.notes.trim() } : {}),
    provenance,
  };

  return { candidate, notices };
}

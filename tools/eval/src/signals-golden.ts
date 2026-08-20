/**
 * Схема записи эталонной выборки сигналов устройств `data/fixtures/signals.golden.json`
 * (docs/08-testing-and-quality.md §8.4, раздел "signals.golden.json — сигналы устройств").
 *
 * До этого агента (5.7) документ фиксировал только источники сбора, обязательные группы записей
 * и целевой объём (не менее 120), но НЕ форму самой записи — ни в типах, ни в схемах, ни в тестах.
 * Наполнить файл без выдуманного на ходу формата было невозможно (docs/appendix-a §А.10 того же
 * класса проблема решалась для `code-suffixes.csv`). Этот модуль заводит форму как код, а не
 * прозу: тип, разборщик без утверждений `as` (ADR-016) и группы, буквально совпадающие с
 * перечнем docs/08 §8.4.
 *
 * Поле `signals` намеренно повторяет форму тела запроса `POST /api/v1/detect`
 * (docs/06-api-contract.md §6.2), а не внутренний тип `DetectionSignals` модуля `detection`
 * (`apps/api/src/modules/detection/detection-signals.ts`): выборка — это то, что реально отправил
 * бы клиент на границу API, а граница API — версионируемый контракт, который переживёт
 * рефакторинг внутреннего типа модуля. `tools/eval` не зависит от `apps/api` ни на уровне
 * пакета, ни на уровне импорта типов (`.cursor/rules/pure-packages.mdc`, дисциплина границ
 * применена и к инструментам, не только к пакетам `packages/*`).
 *
 * Наполнение файла данными — НЕ объём этого агента (см. docs/09-decisions.md, отчёт агента 5.7):
 * единственный практический канал сбора сигналов РЕАЛЬНЫХ устройств — виджет и стенд отладки
 * (`packages/signals-collector` + страница отладки, docs/03 §3.10), которых не существует до
 * этапа интерфейса (docs/11 §11.2, этап 4/агент 6).
 */

/** Девять обязательных групп записей — буквально по перечню docs/08 §8.4. */
export type SignalsGoldenCategory =
  /** "iPhone разных поколений и версий iOS". */
  | 'iphone-generations'
  /** "Android разных вендоров с UA-CH". */
  | 'android-vendor-ua-ch'
  /** "Android без UA-CH". */
  | 'android-no-ua-ch'
  /** "браузеры, отличные от Chrome и Safari". */
  | 'non-standard-browser'
  /** "WebView внутри приложений". */
  | 'webview'
  /** "десктопные браузеры". */
  | 'desktop-browser'
  /** "эмуляция мобильного устройства в средствах разработчика". */
  | 'devtools-emulation'
  /** "планшеты". */
  | 'tablet'
  /** "заведомо неоднозначные сигнатуры". */
  | 'ambiguous-signature';

export const SIGNALS_GOLDEN_CATEGORIES: readonly SignalsGoldenCategory[] = [
  'iphone-generations',
  'android-vendor-ua-ch',
  'android-no-ua-ch',
  'non-standard-browser',
  'webview',
  'desktop-browser',
  'devtools-emulation',
  'tablet',
  'ambiguous-signature',
];

/** `Set<string>` (не `Set<SignalsGoldenCategory>`) — так `.has(value: string)` не требует `as` на границе. */
const SIGNALS_GOLDEN_CATEGORIES_SET: ReadonlySet<string> = new Set(SIGNALS_GOLDEN_CATEGORIES);

function isSignalsGoldenCategory(value: unknown): value is SignalsGoldenCategory {
  return typeof value === 'string' && SIGNALS_GOLDEN_CATEGORIES_SET.has(value);
}

/** Способ сбора (docs/08 §8.4: "с доступных команде устройств через страницу отладки, из открытых баз User-Agent, из эмуляции устройств в браузерах"). */
export type SignalsGoldenSource = 'real-device' | 'public-ua-database' | 'browser-emulation';

const SIGNALS_GOLDEN_SOURCES: readonly SignalsGoldenSource[] = [
  'real-device',
  'public-ua-database',
  'browser-emulation',
];
const SIGNALS_GOLDEN_SOURCES_SET: ReadonlySet<string> = new Set(SIGNALS_GOLDEN_SOURCES);

function isSignalsGoldenSource(value: unknown): value is SignalsGoldenSource {
  return typeof value === 'string' && SIGNALS_GOLDEN_SOURCES_SET.has(value);
}

export type GoldenPlatform = 'ios' | 'android' | 'harmonyos' | 'other';
export type GoldenDeviceType = 'phone' | 'tablet' | 'watch' | 'laptop' | 'other';
export type GoldenStatus = 'supported' | 'not_supported' | 'clarification_required';

const GOLDEN_PLATFORMS: readonly GoldenPlatform[] = ['ios', 'android', 'harmonyos', 'other'];
const GOLDEN_PLATFORMS_SET: ReadonlySet<string> = new Set(GOLDEN_PLATFORMS);
function isGoldenPlatform(value: unknown): value is GoldenPlatform {
  return typeof value === 'string' && GOLDEN_PLATFORMS_SET.has(value);
}

const GOLDEN_DEVICE_TYPES: readonly GoldenDeviceType[] = [
  'phone',
  'tablet',
  'watch',
  'laptop',
  'other',
];
const GOLDEN_DEVICE_TYPES_SET: ReadonlySet<string> = new Set(GOLDEN_DEVICE_TYPES);
function isGoldenDeviceType(value: unknown): value is GoldenDeviceType {
  return typeof value === 'string' && GOLDEN_DEVICE_TYPES_SET.has(value);
}

const GOLDEN_STATUSES: readonly GoldenStatus[] = [
  'supported',
  'not_supported',
  'clarification_required',
];
const GOLDEN_STATUSES_SET: ReadonlySet<string> = new Set(GOLDEN_STATUSES);
function isGoldenStatus(value: unknown): value is GoldenStatus {
  return typeof value === 'string' && GOLDEN_STATUSES_SET.has(value);
}

/** `uaData` — то же подмножество полей, что принимает `POST /api/v1/detect` (docs/06 §6.2). */
export interface GoldenUaData {
  readonly platform?: string;
  readonly mobile?: boolean;
  readonly model?: string;
  readonly platformVersion?: string;
  readonly brands?: readonly { readonly brand: string; readonly version: string }[];
}

export interface GoldenScreenSignals {
  readonly width?: number;
  readonly height?: number;
  readonly dpr?: number;
  readonly orientation?: string;
}

export interface GoldenHardwareSignals {
  readonly maxTouchPoints?: number;
  readonly hardwareConcurrency?: number;
  readonly deviceMemory?: number;
}

export interface GoldenWebglSignals {
  readonly vendor?: string;
  readonly renderer?: string;
}

/** Ровно форма `signals` из тела запроса `POST /api/v1/detect` (docs/06-api-contract.md §6.2). */
export interface GoldenSignals {
  readonly userAgent?: string;
  readonly uaData?: GoldenUaData;
  readonly screen?: GoldenScreenSignals;
  readonly hardware?: GoldenHardwareSignals;
  readonly webgl?: GoldenWebglSignals;
}

/** Ожидаемый исход резолюции — то, что `pnpm eval:detection` (docs/08 §8.6) впоследствии сверит с ответом сервиса. */
export interface GoldenExpectedOutcome {
  readonly platform: GoldenPlatform;
  readonly deviceType: GoldenDeviceType;
  readonly status: GoldenStatus;
  readonly exactModelKnown: boolean;
  /** Идентификатор записи справочника, если статус определён и модель известна точно; иначе `null`. */
  readonly deviceId: string | null;
}

export interface SignalsGoldenEntry {
  /** Уникален по всему файлу, формат `"<category>-NNN"` — тот же принцип, что и у `queries.golden.json`. */
  readonly id: string;
  readonly category: SignalsGoldenCategory;
  /** Человекочитаемое описание устройства/браузера — для отладки расхождений без повторного собирания сигналов. */
  readonly description: string;
  readonly source: SignalsGoldenSource;
  readonly signals: GoldenSignals;
  /** Заголовки `Sec-CH-UA-*`, наблюдавшиеся при сборе (docs/03 §3.2, серверная перекрёстная проверка) — опционально. */
  readonly headers?: Readonly<Record<string, string>>;
  /** Ответ на адресный вопрос уточнения, если сигнатура собиралась ПОСЛЕ его разрешения (docs/06 §6.2). */
  readonly region?: string;
  readonly expected: GoldenExpectedOutcome;
  readonly notes?: string;
}

export interface SignalsGoldenParseResult {
  readonly entries: readonly SignalsGoldenEntry[];
  readonly errors: readonly string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isNonEmptyString(value: unknown): value is string {
  return isString(value) && value.trim().length > 0;
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

function isStringRecord(value: unknown): value is Readonly<Record<string, string>> {
  return isRecord(value) && Object.values(value).every(isString);
}

function parseUaData(value: unknown, path: string, errors: string[]): GoldenUaData | undefined {
  if (value === undefined) {
    return {};
  }
  if (!isRecord(value)) {
    errors.push(`${path}: ожидался объект`);
    return undefined;
  }
  const { platform, mobile, model, platformVersion, brands } = value;
  let valid = true;
  if (platform !== undefined && !isString(platform)) {
    errors.push(`${path}.platform: ожидалась строка`);
    valid = false;
  }
  if (mobile !== undefined && !isBoolean(mobile)) {
    errors.push(`${path}.mobile: ожидалось булево значение`);
    valid = false;
  }
  if (model !== undefined && !isString(model)) {
    errors.push(`${path}.model: ожидалась строка`);
    valid = false;
  }
  if (platformVersion !== undefined && !isString(platformVersion)) {
    errors.push(`${path}.platformVersion: ожидалась строка`);
    valid = false;
  }
  if (
    brands !== undefined &&
    (!Array.isArray(brands) ||
      !brands.every(
        (item) => isRecord(item) && isString(item['brand']) && isString(item['version']),
      ))
  ) {
    errors.push(`${path}.brands: ожидался список объектов { brand, version }`);
    valid = false;
  }
  if (!valid) {
    return undefined;
  }
  return {
    ...(isString(platform) ? { platform } : {}),
    ...(isBoolean(mobile) ? { mobile } : {}),
    ...(isString(model) ? { model } : {}),
    ...(isString(platformVersion) ? { platformVersion } : {}),
    ...(Array.isArray(brands)
      ? {
          brands: brands.map((item) => {
            if (!isRecord(item)) {
              return { brand: '', version: '' };
            }
            const { brand, version } = item;
            return {
              brand: isString(brand) ? brand : '',
              version: isString(version) ? version : '',
            };
          }),
        }
      : {}),
  };
}

function parseScreen(
  value: unknown,
  path: string,
  errors: string[],
): GoldenScreenSignals | undefined {
  if (value === undefined) {
    return {};
  }
  if (!isRecord(value)) {
    errors.push(`${path}: ожидался объект`);
    return undefined;
  }
  const { width, height, dpr, orientation } = value;
  let valid = true;
  if (width !== undefined && !isNumber(width)) {
    errors.push(`${path}.width: ожидалось число`);
    valid = false;
  }
  if (height !== undefined && !isNumber(height)) {
    errors.push(`${path}.height: ожидалось число`);
    valid = false;
  }
  if (dpr !== undefined && !isNumber(dpr)) {
    errors.push(`${path}.dpr: ожидалось число`);
    valid = false;
  }
  if (orientation !== undefined && !isString(orientation)) {
    errors.push(`${path}.orientation: ожидалась строка`);
    valid = false;
  }
  if (!valid) {
    return undefined;
  }
  return {
    ...(isNumber(width) ? { width } : {}),
    ...(isNumber(height) ? { height } : {}),
    ...(isNumber(dpr) ? { dpr } : {}),
    ...(isString(orientation) ? { orientation } : {}),
  };
}

function parseHardware(
  value: unknown,
  path: string,
  errors: string[],
): GoldenHardwareSignals | undefined {
  if (value === undefined) {
    return {};
  }
  if (!isRecord(value)) {
    errors.push(`${path}: ожидался объект`);
    return undefined;
  }
  const { maxTouchPoints, hardwareConcurrency, deviceMemory } = value;
  let valid = true;
  if (maxTouchPoints !== undefined && !isNumber(maxTouchPoints)) {
    errors.push(`${path}.maxTouchPoints: ожидалось число`);
    valid = false;
  }
  if (hardwareConcurrency !== undefined && !isNumber(hardwareConcurrency)) {
    errors.push(`${path}.hardwareConcurrency: ожидалось число`);
    valid = false;
  }
  if (deviceMemory !== undefined && !isNumber(deviceMemory)) {
    errors.push(`${path}.deviceMemory: ожидалось число`);
    valid = false;
  }
  if (!valid) {
    return undefined;
  }
  return {
    ...(isNumber(maxTouchPoints) ? { maxTouchPoints } : {}),
    ...(isNumber(hardwareConcurrency) ? { hardwareConcurrency } : {}),
    ...(isNumber(deviceMemory) ? { deviceMemory } : {}),
  };
}

function parseWebgl(
  value: unknown,
  path: string,
  errors: string[],
): GoldenWebglSignals | undefined {
  if (value === undefined) {
    return {};
  }
  if (!isRecord(value)) {
    errors.push(`${path}: ожидался объект`);
    return undefined;
  }
  const { vendor, renderer } = value;
  let valid = true;
  if (vendor !== undefined && !isString(vendor)) {
    errors.push(`${path}.vendor: ожидалась строка`);
    valid = false;
  }
  if (renderer !== undefined && !isString(renderer)) {
    errors.push(`${path}.renderer: ожидалась строка`);
    valid = false;
  }
  if (!valid) {
    return undefined;
  }
  return {
    ...(isString(vendor) ? { vendor } : {}),
    ...(isString(renderer) ? { renderer } : {}),
  };
}

function parseSignals(value: unknown, path: string, errors: string[]): GoldenSignals | undefined {
  if (!isRecord(value)) {
    errors.push(`${path}: ожидался объект`);
    return undefined;
  }
  const { userAgent, uaData, screen, hardware, webgl } = value;
  let valid = true;
  if (userAgent !== undefined && !isString(userAgent)) {
    errors.push(`${path}.userAgent: ожидалась строка`);
    valid = false;
  }
  const parsedUaData = parseUaData(uaData, `${path}.uaData`, errors);
  if (parsedUaData === undefined) valid = false;
  const parsedScreen = parseScreen(screen, `${path}.screen`, errors);
  if (parsedScreen === undefined) valid = false;
  const parsedHardware = parseHardware(hardware, `${path}.hardware`, errors);
  if (parsedHardware === undefined) valid = false;
  const parsedWebgl = parseWebgl(webgl, `${path}.webgl`, errors);
  if (parsedWebgl === undefined) valid = false;

  if (
    !valid ||
    parsedUaData === undefined ||
    parsedScreen === undefined ||
    parsedHardware === undefined ||
    parsedWebgl === undefined
  ) {
    return undefined;
  }

  return {
    ...(isString(userAgent) ? { userAgent } : {}),
    ...(Object.keys(parsedUaData).length > 0 ? { uaData: parsedUaData } : {}),
    ...(Object.keys(parsedScreen).length > 0 ? { screen: parsedScreen } : {}),
    ...(Object.keys(parsedHardware).length > 0 ? { hardware: parsedHardware } : {}),
    ...(Object.keys(parsedWebgl).length > 0 ? { webgl: parsedWebgl } : {}),
  };
}

function parseExpected(
  value: unknown,
  path: string,
  errors: string[],
): GoldenExpectedOutcome | undefined {
  if (!isRecord(value)) {
    errors.push(`${path}: ожидался объект`);
    return undefined;
  }
  const { platform, deviceType, status, exactModelKnown, deviceId } = value;
  let valid = true;
  if (!isGoldenPlatform(platform)) {
    errors.push(`${path}.platform: ожидалось одно из ${GOLDEN_PLATFORMS.join('/')}`);
    valid = false;
  }
  if (!isGoldenDeviceType(deviceType)) {
    errors.push(`${path}.deviceType: ожидалось одно из ${GOLDEN_DEVICE_TYPES.join('/')}`);
    valid = false;
  }
  if (!isGoldenStatus(status)) {
    errors.push(`${path}.status: ожидалось одно из ${GOLDEN_STATUSES.join('/')}`);
    valid = false;
  }
  if (!isBoolean(exactModelKnown)) {
    errors.push(`${path}.exactModelKnown: ожидалось булево значение`);
    valid = false;
  }
  if (deviceId !== null && !isNonEmptyString(deviceId)) {
    errors.push(`${path}.deviceId: ожидалась непустая строка либо null`);
    valid = false;
  }
  if (
    !valid ||
    !isGoldenPlatform(platform) ||
    !isGoldenDeviceType(deviceType) ||
    !isGoldenStatus(status) ||
    !isBoolean(exactModelKnown) ||
    (deviceId !== null && !isNonEmptyString(deviceId))
  ) {
    return undefined;
  }
  return {
    platform,
    deviceType,
    status,
    exactModelKnown,
    deviceId: deviceId === null ? null : deviceId,
  };
}

function parseEntry(
  value: unknown,
  index: number,
  errors: string[],
): SignalsGoldenEntry | undefined {
  const path = `[${index}]`;
  if (!isRecord(value)) {
    errors.push(`${path}: ожидался объект`);
    return undefined;
  }

  const { id, category, description, source, signals, headers, region, expected, notes } = value;

  if (!isNonEmptyString(id)) {
    errors.push(`${path}.id: ожидалась непустая строка`);
    return undefined;
  }
  if (!isSignalsGoldenCategory(category)) {
    errors.push(`${path}.category: ожидалось одно из ${SIGNALS_GOLDEN_CATEGORIES.join('/')}`);
    return undefined;
  }
  if (!isNonEmptyString(description)) {
    errors.push(`${path}.description: ожидалась непустая строка`);
    return undefined;
  }
  if (!isSignalsGoldenSource(source)) {
    errors.push(`${path}.source: ожидалось одно из ${SIGNALS_GOLDEN_SOURCES.join('/')}`);
    return undefined;
  }
  if (headers !== undefined && !isStringRecord(headers)) {
    errors.push(`${path}.headers: ожидался объект строка→строка`);
    return undefined;
  }
  if (region !== undefined && !isNonEmptyString(region)) {
    errors.push(`${path}.region: ожидалась непустая строка либо отсутствие поля`);
    return undefined;
  }
  if (notes !== undefined && !isNonEmptyString(notes)) {
    errors.push(`${path}.notes: ожидалась непустая строка либо отсутствие поля`);
    return undefined;
  }

  const parsedSignals = parseSignals(signals, `${path}.signals`, errors);
  if (parsedSignals === undefined) {
    return undefined;
  }
  const parsedExpected = parseExpected(expected, `${path}.expected`, errors);
  if (parsedExpected === undefined) {
    return undefined;
  }

  return {
    id,
    category,
    description,
    source,
    signals: parsedSignals,
    expected: parsedExpected,
    ...(headers !== undefined && isStringRecord(headers) ? { headers } : {}),
    ...(region !== undefined ? { region } : {}),
    ...(notes !== undefined ? { notes } : {}),
  };
}

/** Разбор `data/fixtures/signals.golden.json` из недоверенных внешних данных (ADR-016: без `as` на границе). */
export function parseSignalsGolden(value: unknown): SignalsGoldenParseResult {
  if (!Array.isArray(value)) {
    return { entries: [], errors: ['signals.golden.json: ожидался массив записей'] };
  }

  const errors: string[] = [];
  const entries: SignalsGoldenEntry[] = [];
  value.forEach((item, index) => {
    const entry = parseEntry(item, index, errors);
    if (entry !== undefined) {
      entries.push(entry);
    }
  });

  return { entries, errors };
}

import type { DetectResponse } from '@esim-detector/widget';
import type {
  GoldenDeviceType,
  GoldenExpectedOutcome,
  GoldenPlatform,
  GoldenStatus,
  SignalsGoldenCategory,
  SignalsGoldenSource,
} from '@esim-detector/tools-eval';

/**
 * Черновик записи эталонной выборки (docs/08-testing-and-quality.md §8.4, ADR-037) — структурно
 * совпадает с `SignalsGoldenEntry` (`@esim-detector/tools-eval`), но поле `signals` типизировано
 * как `unknown`: это РОВНО отправленное тело запроса `POST /api/v1/detect` (задача этапа 6.4, п.2),
 * взятое из состояния стенда без повторной валидации формы — валидацию делает при разборе сама
 * `parseSignalsGolden` (проверено тестом `golden-export.spec.ts`), а не этот модуль дважды.
 */
export interface GoldenDraftEntry {
  readonly id: string;
  readonly category: SignalsGoldenCategory;
  readonly description: string;
  readonly source: SignalsGoldenSource;
  readonly signals: unknown;
  readonly region?: string;
  readonly expected: GoldenExpectedOutcome;
  readonly notes: string;
}

export const GOLDEN_CATEGORY_OPTIONS: ReadonlyArray<{
  readonly value: SignalsGoldenCategory;
  readonly label: string;
}> = [
  { value: 'iphone-generations', label: 'iPhone разных поколений и версий iOS' },
  { value: 'android-vendor-ua-ch', label: 'Android разных вендоров с UA-CH' },
  { value: 'android-no-ua-ch', label: 'Android без UA-CH' },
  { value: 'non-standard-browser', label: 'Браузеры, отличные от Chrome и Safari' },
  { value: 'webview', label: 'WebView внутри приложений' },
  { value: 'desktop-browser', label: 'Десктопные браузеры' },
  { value: 'devtools-emulation', label: 'Эмуляция мобильного устройства в средствах разработчика' },
  { value: 'tablet', label: 'Планшеты' },
  { value: 'ambiguous-signature', label: 'Заведомо неоднозначные сигнатуры' },
];

export const GOLDEN_SOURCE_OPTIONS: ReadonlyArray<{
  readonly value: SignalsGoldenSource;
  readonly label: string;
}> = [
  { value: 'real-device', label: 'С реального устройства' },
  { value: 'public-ua-database', label: 'Из открытой базы User-Agent' },
  { value: 'browser-emulation', label: 'Эмуляция в браузере' },
];

export const GOLDEN_PLATFORM_OPTIONS: readonly GoldenPlatform[] = [
  'ios',
  'android',
  'harmonyos',
  'other',
];

export const GOLDEN_DEVICE_TYPE_OPTIONS: readonly GoldenDeviceType[] = [
  'phone',
  'tablet',
  'watch',
  'laptop',
  'other',
];

export const GOLDEN_STATUS_OPTIONS: readonly GoldenStatus[] = [
  'supported',
  'not_supported',
  'clarification_required',
];

/**
 * Черновик `expected` из ответа `/detect` — предзаполнение, а НЕ подтверждённое значение
 * (задача этапа 6.4, п.2: маркировка «требует проверки» — `GOLDEN_EXPECTED_DRAFT_WARNING` ниже,
 * ADR-013/ADR-032 п.4 — «не подправлять эталон под выгрузку», тот же принцип для предзаполнения).
 * `Platform`/`DeviceType`/`ResultStatus` ответа API — те же строковые литералы, что и
 * `GoldenPlatform`/`GoldenDeviceType`/`GoldenStatus` (обе стороны версионируют один контракт
 * docs/06 §6.2, ADR-037), поэтому присваивание корректно без утверждения типа.
 */
export function buildExpectedDraft(response: DetectResponse): GoldenExpectedOutcome {
  return {
    platform: response.detection.platform,
    deviceType: response.detection.deviceType,
    status: response.status,
    exactModelKnown: response.detection.exactModelKnown,
    deviceId: response.device?.id ?? null,
  };
}

export const GOLDEN_EXPECTED_DRAFT_NOTE =
  'ЧЕРНОВИК: поле expected предзаполнено ответом сервиса и НЕ проверено человеком — перед ' +
  'сохранением в signals.golden.json проверьте его по правилам docs/03-detection-algorithm.md.';

function randomId(category: SignalsGoldenCategory): string {
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${category}-draft-${suffix}`;
}

export interface GoldenDraftInput {
  readonly category: SignalsGoldenCategory;
  readonly source: SignalsGoldenSource;
  readonly description: string;
  /** РОВНО значение, отправленное последним запросом `POST /api/v1/detect` (см. `GoldenDraftEntry`). */
  readonly signals: unknown;
  readonly expected: GoldenExpectedOutcome;
  readonly region?: string;
  readonly notes?: string;
}

export function buildGoldenDraft(input: GoldenDraftInput): GoldenDraftEntry {
  const operatorNotes = input.notes?.trim();
  return {
    id: randomId(input.category),
    category: input.category,
    description: input.description,
    source: input.source,
    signals: input.signals,
    expected: input.expected,
    ...(input.region !== undefined ? { region: input.region } : {}),
    notes:
      operatorNotes !== undefined && operatorNotes.length > 0
        ? `${GOLDEN_EXPECTED_DRAFT_NOTE} ${operatorNotes}`
        : GOLDEN_EXPECTED_DRAFT_NOTE,
  };
}

export function stringifyGoldenDraft(entry: GoldenDraftEntry): string {
  return JSON.stringify(entry, null, 2);
}

export interface GoldenCategorySuggestion {
  readonly category: SignalsGoldenCategory;
  readonly reason: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function readOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function readOptionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

interface ParsedCategorySignals {
  readonly userAgent: string;
  readonly uaPlatform: string | undefined;
  readonly uaMobile: boolean | undefined;
  readonly uaModel: string | undefined;
  readonly brands: readonly string[];
  readonly maxTouchPoints: number | undefined;
  readonly webglRenderer: string | undefined;
  readonly minCssSide: number | undefined;
}

/**
 * Разбор тела `signals` без утверждения `as` (ADR-016): нужны только поля, по которым
 * выбирается категория выборки, а не полный тип запроса `/detect`.
 */
function parseSignalsForCategory(signals: unknown): ParsedCategorySignals {
  if (!isRecord(signals)) {
    return {
      userAgent: '',
      uaPlatform: undefined,
      uaMobile: undefined,
      uaModel: undefined,
      brands: [],
      maxTouchPoints: undefined,
      webglRenderer: undefined,
      minCssSide: undefined,
    };
  }

  const uaData = isRecord(signals.uaData) ? signals.uaData : undefined;
  const hardware = isRecord(signals.hardware) ? signals.hardware : undefined;
  const webgl = isRecord(signals.webgl) ? signals.webgl : undefined;
  const screen = isRecord(signals.screen) ? signals.screen : undefined;

  const brands: string[] = [];
  if (uaData !== undefined && Array.isArray(uaData.brands)) {
    for (const item of uaData.brands) {
      if (!isRecord(item)) {
        continue;
      }
      const brand = readOptionalString(item.brand);
      if (brand !== undefined) {
        brands.push(brand);
      }
    }
  }

  const width = screen !== undefined ? readOptionalNumber(screen.width) : undefined;
  const height = screen !== undefined ? readOptionalNumber(screen.height) : undefined;
  const minCssSide =
    width !== undefined && height !== undefined ? Math.min(width, height) : undefined;

  return {
    userAgent: readOptionalString(signals.userAgent) ?? '',
    uaPlatform: uaData !== undefined ? readOptionalString(uaData.platform) : undefined,
    uaMobile: uaData !== undefined ? readOptionalBoolean(uaData.mobile) : undefined,
    uaModel: uaData !== undefined ? readOptionalString(uaData.model) : undefined,
    brands,
    maxTouchPoints:
      hardware !== undefined ? readOptionalNumber(hardware.maxTouchPoints) : undefined,
    webglRenderer: webgl !== undefined ? readOptionalString(webgl.renderer) : undefined,
    minCssSide,
  };
}

type SuggestedPlatform = 'ios' | 'android' | 'harmonyos' | 'other';

/**
 * Упрощённая классификация платформы по тем же приоритетам, что `classify-platform.ts`
 * (docs/03 §3.3): только чтобы выбрать корзину выборки, не чтобы повторить ответ `/detect`.
 */
function suggestPlatform(parsed: ParsedCategorySignals): SuggestedPlatform {
  const { userAgent, uaPlatform, maxTouchPoints } = parsed;
  if (/iphone|ipad|ipod|cpu (?:iphone )?os \d/i.test(userAgent)) {
    return 'ios';
  }
  if (/harmonyos|openharmony/i.test(userAgent)) {
    return 'harmonyos';
  }
  if (/android/i.test(userAgent)) {
    return 'android';
  }
  if (/macintosh/i.test(userAgent) && maxTouchPoints !== undefined && maxTouchPoints > 0) {
    return 'ios';
  }
  const normalized = uaPlatform?.trim().toLowerCase();
  if (normalized === 'android') {
    return 'android';
  }
  if (normalized === 'harmonyos') {
    return 'harmonyos';
  }
  if (normalized === 'ios' || normalized === 'ipados') {
    return 'ios';
  }
  return 'other';
}

const DESKTOP_OR_SOFTWARE_GPU_MARKERS: readonly string[] = [
  'swiftshader',
  'llvmpipe',
  'microsoft basic render',
  'direct3d11 vs_5_0',
  'direct3d9',
  'mesa',
  'angle (intel',
  'angle (nvidia',
  'angle (amd',
  'vmware',
  'virtualbox',
];

function looksLikeEmulation(parsed: ParsedCategorySignals, platform: SuggestedPlatform): boolean {
  if (platform !== 'ios' && platform !== 'android' && platform !== 'harmonyos') {
    return false;
  }
  if (parsed.maxTouchPoints === 0) {
    return true;
  }
  const renderer = parsed.webglRenderer?.toLowerCase();
  if (renderer === undefined) {
    return false;
  }
  return DESKTOP_OR_SOFTWARE_GPU_MARKERS.some((marker) => renderer.includes(marker));
}

function hasUaChModel(model: string | undefined): model is string {
  const trimmed = model?.trim();
  return trimmed !== undefined && trimmed.length > 0 && trimmed.toLowerCase() !== 'k';
}

function looksLikeTablet(parsed: ParsedCategorySignals, platform: SuggestedPlatform): boolean {
  if (/ipad/i.test(parsed.userAgent)) {
    return true;
  }
  if (
    /macintosh/i.test(parsed.userAgent) &&
    parsed.maxTouchPoints !== undefined &&
    parsed.maxTouchPoints > 0
  ) {
    return true;
  }
  if (platform !== 'android' && platform !== 'harmonyos') {
    return false;
  }
  if (parsed.uaMobile === false) {
    return true;
  }
  return parsed.uaMobile !== true && parsed.minCssSide !== undefined && parsed.minCssSide >= 600;
}

function looksLikeNonStandardBrowser(parsed: ParsedCategorySignals): boolean {
  const ua = parsed.userAgent;
  if (/firefox/i.test(ua) || /fxios/i.test(ua)) {
    return true;
  }
  if (/samsungbrowser/i.test(ua) || /ucbrowser/i.test(ua) || /opr\/|opera/i.test(ua)) {
    return true;
  }
  if (/yabrowser/i.test(ua) || /edga\//i.test(ua)) {
    return true;
  }
  const brandNames = parsed.brands.map((brand) => brand.toLowerCase());
  if (brandNames.length === 0) {
    return false;
  }
  const chromiumFamily = brandNames.some(
    (brand) => brand.includes('chrome') || brand.includes('chromium') || brand.includes('edge'),
  );
  return !chromiumFamily;
}

/**
 * Предлагает категорию эталонной выборки по отправленным сигналам, а не по ответу `/detect`.
 * `expected` по-прежнему черновик из ответа (ADR-041/ADR-042); категория — свойство набора
 * сигналов, его нельзя списывать с `detection.method`, иначе выборка повторит ошибку сервиса.
 */
export function suggestGoldenCategory(signals: unknown): GoldenCategorySuggestion {
  const parsed = parseSignalsForCategory(signals);
  const platform = suggestPlatform(parsed);

  if (/; wv\)/i.test(parsed.userAgent) || /webview/i.test(parsed.userAgent)) {
    return { category: 'webview', reason: 'в User-Agent есть признак WebView' };
  }

  if (looksLikeEmulation(parsed, platform)) {
    return {
      category: 'devtools-emulation',
      reason: 'мобильный User-Agent при признаках эмуляции (нет касаний или десктопный GPU)',
    };
  }

  const macWithoutTouch =
    /macintosh/i.test(parsed.userAgent) &&
    parsed.maxTouchPoints === undefined &&
    platform === 'other';
  if (macWithoutTouch) {
    return {
      category: 'ambiguous-signature',
      reason: 'Mac-подобный User-Agent без maxTouchPoints — iPad и компьютер неразличимы',
    };
  }

  if (looksLikeTablet(parsed, platform)) {
    return { category: 'tablet', reason: 'сигналы указывают на планшет' };
  }

  if (platform === 'ios') {
    return { category: 'iphone-generations', reason: 'в User-Agent есть iPhone' };
  }

  if ((platform === 'android' || platform === 'harmonyos') && hasUaChModel(parsed.uaModel)) {
    return {
      category: 'android-vendor-ua-ch',
      reason: `в uaData.model пришло «${parsed.uaModel.trim()}»`,
    };
  }

  if (looksLikeNonStandardBrowser(parsed)) {
    return {
      category: 'non-standard-browser',
      reason: 'браузер не Chrome и не Safari',
    };
  }

  if (platform === 'android' || platform === 'harmonyos') {
    return {
      category: 'android-no-ua-ch',
      reason: 'uaData.model пуст или равен K — модель ищется в User-Agent',
    };
  }

  if (platform === 'other' && parsed.userAgent.length > 0) {
    return { category: 'desktop-browser', reason: 'платформа не мобильная' };
  }

  return {
    category: 'ambiguous-signature',
    reason: 'по сигналам категорию однозначно не выбрать — проверьте вручную',
  };
}

/** Канал сбора угадывается только при явной эмуляции; иначе оператор оставляет значение сам. */
export function suggestGoldenSource(signals: unknown): SignalsGoldenSource | undefined {
  const parsed = parseSignalsForCategory(signals);
  const platform = suggestPlatform(parsed);
  if (looksLikeEmulation(parsed, platform)) {
    return 'browser-emulation';
  }
  return undefined;
}

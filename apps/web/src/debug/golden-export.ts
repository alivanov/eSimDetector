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

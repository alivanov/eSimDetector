import type {
  CollectedHardwareSignals,
  CollectedScreenSignals,
  CollectedSignals,
  CollectedUaBrand,
  CollectedUaDataSignals,
  CollectedWebglSignals,
} from './collected-signals';
import type {
  HighEntropyValuesLike,
  NavigatorLike,
  NavigatorUaDataLike,
  ScreenLike,
  SignalsSource,
} from './signals-source';

/**
 * Высокоэнтропийные подсказки, запрашиваемые у `getHighEntropyValues` (docs/03 §3.2): модель,
 * версия платформы, полный список версий, архитектура, битность.
 */
const HIGH_ENTROPY_HINTS: readonly string[] = [
  'model',
  'platformVersion',
  'fullVersionList',
  'architecture',
  'bitness',
];

/**
 * Ни один сбор сигнала не должен ронять весь `collectSignals` (.cursor/rules/ui-and-widget.mdc):
 * оборачивает синхронный вызов, превращая исключение в отсутствие сигнала — отсутствие сигнала
 * неотличимо для вызывающего кода от честного «браузер этого не сообщил».
 */
function safeCall<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch {
    return undefined;
  }
}

function pruneEmpty<T extends object>(value: T): T | undefined {
  return Object.keys(value).length > 0 ? value : undefined;
}

function toInt(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value)) {
    return undefined;
  }
  return Math.round(value);
}

interface LowEntropyUaData {
  readonly platform?: string;
  readonly mobile?: boolean;
  readonly brands?: readonly CollectedUaBrand[];
}

function buildLowEntropyUaData(uaData: NavigatorUaDataLike): LowEntropyUaData {
  return {
    ...(uaData.platform !== undefined ? { platform: uaData.platform } : {}),
    ...(uaData.mobile !== undefined ? { mobile: uaData.mobile } : {}),
    ...(uaData.brands !== undefined ? { brands: uaData.brands } : {}),
  };
}

/**
 * Высокоэнтропийные значения запрашиваются отдельно от низкоэнтропийных: отклонённое обещание
 * `getHighEntropyValues` (браузер отказал в подсказке) не должно стирать уже известные
 * `platform`/`mobile`/`brands` — это единственная причина, по которой `try/catch` здесь не
 * поднят на уровень всей функции `collectUaData`.
 */
async function requestHighEntropyValues(
  uaData: NavigatorUaDataLike,
): Promise<HighEntropyValuesLike | undefined> {
  try {
    return await uaData.getHighEntropyValues(HIGH_ENTROPY_HINTS);
  } catch {
    return undefined;
  }
}

async function collectUaData(
  navigator: NavigatorLike,
): Promise<CollectedUaDataSignals | undefined> {
  const uaData = safeCall(() => navigator.userAgentData);
  if (uaData === undefined) {
    return undefined;
  }

  const lowEntropy = safeCall(() => buildLowEntropyUaData(uaData)) ?? {};
  const highEntropy = await requestHighEntropyValues(uaData);

  const result: CollectedUaDataSignals = {
    ...lowEntropy,
    ...(highEntropy?.model !== undefined ? { model: highEntropy.model } : {}),
    ...(highEntropy?.platformVersion !== undefined
      ? { platformVersion: highEntropy.platformVersion }
      : {}),
    ...(highEntropy?.fullVersionList !== undefined
      ? { fullVersionList: highEntropy.fullVersionList }
      : {}),
    ...(highEntropy?.architecture !== undefined ? { architecture: highEntropy.architecture } : {}),
    ...(highEntropy?.bitness !== undefined ? { bitness: highEntropy.bitness } : {}),
  };
  return pruneEmpty(result);
}

function buildScreenSignals(screen: ScreenLike, devicePixelRatio: number): CollectedScreenSignals {
  const width = toInt(screen.width);
  const height = toInt(screen.height);
  const availWidth = toInt(screen.availWidth);
  const availHeight = toInt(screen.availHeight);
  const orientation = screen.orientation?.type;

  return {
    ...(width !== undefined ? { width } : {}),
    ...(height !== undefined ? { height } : {}),
    ...(availWidth !== undefined ? { availWidth } : {}),
    ...(availHeight !== undefined ? { availHeight } : {}),
    ...(Number.isFinite(devicePixelRatio) ? { dpr: devicePixelRatio } : {}),
    ...(orientation !== undefined ? { orientation } : {}),
  };
}

function collectScreen(
  screen: ScreenLike,
  devicePixelRatio: number,
): CollectedScreenSignals | undefined {
  const result = safeCall(() => buildScreenSignals(screen, devicePixelRatio));
  return result === undefined ? undefined : pruneEmpty(result);
}

function buildHardwareSignals(navigator: NavigatorLike): CollectedHardwareSignals {
  const maxTouchPoints = toInt(navigator.maxTouchPoints);
  const hardwareConcurrency = toInt(navigator.hardwareConcurrency);
  const deviceMemory = navigator.deviceMemory;

  return {
    ...(maxTouchPoints !== undefined ? { maxTouchPoints } : {}),
    ...(hardwareConcurrency !== undefined ? { hardwareConcurrency } : {}),
    ...(deviceMemory !== undefined ? { deviceMemory } : {}),
  };
}

function collectHardware(navigator: NavigatorLike): CollectedHardwareSignals | undefined {
  const result = safeCall(() => buildHardwareSignals(navigator));
  return result === undefined ? undefined : pruneEmpty(result);
}

function readWebglSignals(source: SignalsSource): CollectedWebglSignals | undefined {
  const probe = source.createWebglProbe();
  if (probe === null) {
    return undefined;
  }
  const info = probe.readVendorAndRenderer();
  if (info === null) {
    return undefined;
  }
  return { vendor: info.vendor, renderer: info.renderer };
}

function collectWebgl(source: SignalsSource): CollectedWebglSignals | undefined {
  return safeCall(() => readWebglSignals(source));
}

/**
 * Собирает ровно перечень docs/03-detection-algorithm.md §3.2 в форме поля `signals` тела
 * `POST /api/v1/detect` (docs/06 §6.2). Никогда не бросает исключение (.cursor/rules/
 * ui-and-widget.mdc) — отсутствие любого сигнала (реальное отсутствие в браузере или сбой при
 * чтении) даёт отсутствие соответствующего поля результата, а не отказ всего вызова.
 */
export async function collectSignals(source: SignalsSource): Promise<CollectedSignals> {
  const userAgent = safeCall(() => source.navigator.userAgent);
  const uaData = await collectUaData(source.navigator);
  const screen = collectScreen(source.screen, source.devicePixelRatio);
  const hardware = collectHardware(source.navigator);
  const webgl = collectWebgl(source);

  return {
    ...(userAgent !== undefined ? { userAgent } : {}),
    ...(uaData !== undefined ? { uaData } : {}),
    ...(screen !== undefined ? { screen } : {}),
    ...(hardware !== undefined ? { hardware } : {}),
    ...(webgl !== undefined ? { webgl } : {}),
  };
}

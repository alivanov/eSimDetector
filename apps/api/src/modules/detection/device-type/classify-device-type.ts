import type { DeviceType, Platform } from '@esim-detector/contracts';

import type { ApiReason } from '../../../common/response';
import type { DetectionSignals, ScreenSignals } from '../detection-signals';

/**
 * Классификация типа устройства (docs/03-detection-algorithm.md, §3.2/§3.9а; docs/09-decisions.md
 * ADR-034, этап 5.6). Отдельный шаг ПОСЛЕ классификации платформы (`classifyPlatform`) — платформа
 * отвечает на вопрос "какая ОС", эта функция — на вопрос "какой класс устройства", и разделение
 * важно, потому что у iOS они решаются РАЗНЫМИ сигналами (текст User-Agent vs `maxTouchPoints`,
 * см. `classify-platform.ts`), а у Android/HarmonyOS — общими (`uaData.mobile`, геометрия экрана).
 *
 * `ambiguous: true` означает, что сигналы не позволяют уверенно назвать тип — вызывающая сторона
 * обязана уйти в уточнение, а не молча принять `deviceType` как факт (AGENTS.md, предметное
 * правило 1, применённое здесь не к статусу eSIM, а к самому типу устройства: ошибка в типе —
 * такой же ложный результат в смысле К1, как ошибка в статусе). Часы определяются ОТДЕЛЬНО от
 * платформы и раньше остальных проверок: у них почти никогда нет браузера вовсе (задача — не
 * попытаться разобрать их как телефон, а не покрыть их полнотой, ADR-025 п.4).
 */
export interface DeviceTypeClassification {
  readonly deviceType: DeviceType;
  readonly ambiguous: boolean;
  readonly reasons: ApiReason[];
}

/**
 * `"Apple Watch"`, `"Wear OS"`, `"Galaxy Watch4/5/6/7"` и т. п. — часы называют себя явно, в
 * отличие от iPad (docs/03 §3.9а). Без завершающей `\b` намеренно: маркетинговые названия часов
 * приклеивают номер поколения прямо к слову без разделителя ("Watch7"), и `\bwatch\b` на такой
 * строке не совпадает вовсе — между "h" и "7" нет границы слова с точки зрения регулярных выражений.
 */
const WATCH_PATTERN = /\bwatch|wear ?os/i;
const IPAD_UA_PATTERN = /ipad/i;
const IPHONE_OR_IPOD_UA_PATTERN = /iphone|ipod/i;
/**
 * Тот же признак, что `classify-platform.ts` использует для переключения платформы на `ios`.
 * Намеренно ТОЛЬКО `"Macintosh"` (токен настольного браузера), а не более широкое `"Mac OS X"` —
 * суффикс `like Mac OS X` присутствует в UA ЛЮБОГО устройства Apple, включая настоящий iPhone
 * (`"CPU iPhone OS 18_5 like Mac OS X"`), и более широкий вариант ложно "находил" бы Mac в любой
 * строке iOS/iPadOS независимо от режима сайта.
 */
const MAC_LIKE_USER_AGENT = /macintosh/i;

/**
 * Типичная граница CSS-ширины (в портретной ориентации), ниже которой Android-устройство —
 * телефон, а не планшет (используется ТОЛЬКО как резерв при отсутствии `uaData.mobile` — Chrome
 * для Android заполняет `Sec-CH-UA-Mobile` практически всегда, docs/03 §3.2). Значение совпадает с
 * границей `sw600dp`, которой сама платформа Android размечает планшеты в разработке приложений —
 * не наше изобретение, а общепринятая по факту величина.
 */
const ANDROID_TABLET_MIN_CSS_WIDTH = 600;

function minCssDimension(screen: ScreenSignals | undefined): number | undefined {
  if (screen?.width === undefined || screen.height === undefined) {
    return undefined;
  }
  return Math.min(screen.width, screen.height);
}

function classifyIos(
  userAgent: string,
): Omit<DeviceTypeClassification, 'ambiguous'> & { ambiguous: false } {
  if (IPHONE_OR_IPOD_UA_PATTERN.test(userAgent)) {
    return { deviceType: 'phone', ambiguous: false, reasons: [] };
  }
  if (IPAD_UA_PATTERN.test(userAgent)) {
    return {
      deviceType: 'tablet',
      ambiguous: false,
      reasons: [{ code: 'DEVICE_TYPE_TABLET_DETECTED', detail: 'user-agent содержит "iPad"' }],
    };
  }
  if (MAC_LIKE_USER_AGENT.test(userAgent)) {
    // `classifyPlatform` возвращает `ios` для Mac-подобного UA ТОЛЬКО когда `maxTouchPoints > 0`
    // достоверно известен (см. `classify-platform.ts`) — на этой ветке признак сенсорного экрана
    // уже подтверждён, а значит это iPad в режиме сайта для компьютера, а не настоящий Mac.
    return {
      deviceType: 'tablet',
      ambiguous: false,
      reasons: [
        {
          code: 'DEVICE_TYPE_TABLET_DETECTED',
          detail: 'user-agent настольного Safari при maxTouchPoints > 0 (iPadOS 13+)',
        },
      ],
    };
  }
  return { deviceType: 'phone', ambiguous: false, reasons: [] };
}

function classifyAndroidLike(signals: DetectionSignals | undefined): DeviceTypeClassification {
  const mobile = signals?.uaData?.mobile;
  if (mobile === false) {
    return {
      deviceType: 'tablet',
      ambiguous: false,
      reasons: [{ code: 'DEVICE_TYPE_TABLET_DETECTED', detail: 'Sec-CH-UA-Mobile=?0' }],
    };
  }
  if (mobile === true) {
    return { deviceType: 'phone', ambiguous: false, reasons: [] };
  }

  // `uaData.mobile` не пришёл вовсе (Firefox для Android, WebView без UA-CH) — резервный сигнал
  // по геометрии экрана слабее прямого заявления браузера, поэтому расширенный планшет по нему
  // помечается неоднозначным, а не принимается как факт.
  const minDimension = minCssDimension(signals?.screen);
  if (minDimension !== undefined && minDimension >= ANDROID_TABLET_MIN_CSS_WIDTH) {
    return {
      deviceType: 'tablet',
      ambiguous: true,
      reasons: [
        {
          code: 'DEVICE_TYPE_AMBIGUOUS',
          detail: `экран ${minDimension}px без Sec-CH-UA-Mobile — телефон или планшет неотличимы`,
        },
      ],
    };
  }
  return { deviceType: 'phone', ambiguous: false, reasons: [] };
}

export function classifyDeviceType(
  platform: Platform,
  signals: DetectionSignals | undefined,
): DeviceTypeClassification {
  const userAgent = signals?.userAgent ?? '';
  const uaModel = signals?.uaData?.model ?? '';
  if (WATCH_PATTERN.test(userAgent) || WATCH_PATTERN.test(uaModel)) {
    return {
      deviceType: 'watch',
      ambiguous: false,
      reasons: [{ code: 'DEVICE_TYPE_WATCH_DETECTED' }],
    };
  }

  if (platform === 'ios') {
    return classifyIos(userAgent);
  }
  if (platform === 'android' || platform === 'harmonyos') {
    return classifyAndroidLike(signals);
  }

  // `platform === 'other'`: если строка похожа на Mac, но `classifyPlatform` не переключил
  // платформу на `ios`, значит `maxTouchPoints` либо равен 0 (настоящий Mac — не планшет), либо
  // сигнал вовсе не пришёл. Отличить эти два случая друг от друга нечем — это и есть та самая
  // неоднозначность "настоящий Mac с сенсорным экраном или iPad в режиме настольного сайта",
  // которую задача прямо требует не разрешать догадкой.
  if (MAC_LIKE_USER_AGENT.test(userAgent) && signals?.hardware?.maxTouchPoints === undefined) {
    return {
      deviceType: 'other',
      ambiguous: true,
      reasons: [
        {
          code: 'DEVICE_TYPE_AMBIGUOUS',
          detail: 'user-agent настольного Safari/Mac без сигнала maxTouchPoints',
        },
      ],
    };
  }

  return { deviceType: 'other', ambiguous: false, reasons: [] };
}

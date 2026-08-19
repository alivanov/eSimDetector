import type { Platform } from '@esim-detector/contracts';

import type { DetectionSignals } from '../detection-signals';

/**
 * Классификация платформы (docs/03-detection-algorithm.md, §3.3, узел "Платформа?"). Порядок
 * проверок важен: строка User-Agent — самый надёжный источник для iOS/HarmonyOS, `uaData.platform`
 * — резервный источник для Android/HarmonyOS, когда UA был урезан (Chrome на Android редуцирует UA
 * до `Android 10; K`, но `navigator.userAgentData.platform` при этом доступен).
 *
 * **HarmonyOS распознаётся по ДВУМ вариантам строки, а не одному** (docs/09 ADR-024, п.2,
 * подтверждено этапом 5.5 реальным образцом UA современного HarmonyOS NEXT). Строка UA
 * настоящего браузера Huawei на HarmonyOS NEXT (ArkWeb) не содержит слова `HarmonyOS` вовсе:
 * `Mozilla/5.0 (Phone; OpenHarmony 6.0; Android 10) ... ArkWeb/6.0.0.130 Mobile HuaweiBrowser/5.1.12.351`
 * — платформа названа `OpenHarmony` (имя открытого проекта, на котором построен HarmonyOS), а
 * `Android 10` присутствует РЯДОМ как токен совместимости для старого веб-кода, который такую
 * строку не разбирает. Прежняя проверка искала только `/harmonyos/i`, которая под `OpenHarmony`
 * не подпадает, — реальное устройство проваливалось в проверку `/android/i` ниже и получало
 * платформу `android` вместо `harmonyos` (функционально безопасно для §3.4, ветка общая, но
 * искажает поле `platform` ответа и метрики). Проверка `uaData.platform === 'harmonyos'` ниже —
 * подстраховка на случай браузера, который когда-нибудь начнёт называть платформу явно: у
 * подтверждённого HarmonyOS NEXT `Sec-CH-UA-Platform`/`navigator.userAgentData.platform`
 * возвращает `"Unknown"`, а не `"HarmonyOS"` (система не зарегистрирована в списке платформ
 * Chromium UA-CH), поэтому НА РЕАЛЬНЫХ устройствах эта проверка сейчас не срабатывает — строка
 * User-Agent остаётся единственным практическим путём.
 *
 * **iPad в режиме настольного сайта (docs/09 ADR-034, этап 5.6).** Safari на iPadOS 13 и новее по
 * умолчанию отправляет User-Agent НАСТОЛЬНОГО Safari на macOS (`Macintosh; Intel Mac OS X ...`) —
 * ни слова `iPad`, ни версии iPadOS в строке нет вовсе, поэтому по одному `userAgent` такой iPad
 * неотличим от настоящего Mac. Единственный различитель — `navigator.maxTouchPoints` (docs/03
 * §3.2): у настоящего Mac (даже с Force Touch-трекпадом) сенсорного экрана нет и значение равно
 * `0`, у iPad — больше `0`. Проверка `isIpadOnDesktopSafari` применяется ТОЛЬКО когда сигнал
 * получен и достоверно больше нуля: отсутствие сигнала (`undefined`) не трактуется как признак
 * планшета — это ровно тот случай неоднозначности, который AGENTS.md требует разрешать уточнением,
 * а не догадкой (реализовано `classifyDeviceType`/`resolveDetection`, а не здесь, чтобы эта функция
 * продолжала возвращать только платформу).
 */
export function classifyPlatform(signals: DetectionSignals | undefined): Platform {
  const userAgent = signals?.userAgent ?? '';

  if (/iphone|ipad|ipod|cpu (?:iphone )?os \d/i.test(userAgent)) {
    return 'ios';
  }
  if (/harmonyos|openharmony/i.test(userAgent)) {
    return 'harmonyos';
  }
  if (/android/i.test(userAgent)) {
    return 'android';
  }
  if (isIpadOnDesktopSafari(userAgent, signals)) {
    return 'ios';
  }

  const uaPlatform = signals?.uaData?.platform?.trim().toLowerCase();
  if (uaPlatform === 'android') {
    return 'android';
  }
  if (uaPlatform === 'harmonyos') {
    return 'harmonyos';
  }
  if (uaPlatform === 'ios' || uaPlatform === 'ipados') {
    return 'ios';
  }

  return 'other';
}

/**
 * Строка UA настольного Safari/Chrome на macOS — общая для настоящего Mac и iPad в режиме сайта
 * для компьютера. Намеренно ТОЛЬКО `"Macintosh"`, а не более широкое `"Mac OS X"` — этот суффикс
 * входит в UA любого устройства Apple, включая настоящий iPhone (`"like Mac OS X"`), и более
 * широкий вариант ложно совпадал бы с обычным UA iPhone/iPad, которые эта функция уже распознала
 * выше явным токеном `iphone`/`ipad`/`ipod`.
 */
const MAC_LIKE_USER_AGENT = /macintosh/i;

function isIpadOnDesktopSafari(userAgent: string, signals: DetectionSignals | undefined): boolean {
  if (!MAC_LIKE_USER_AGENT.test(userAgent)) {
    return false;
  }
  const maxTouchPoints = signals?.hardware?.maxTouchPoints;
  return maxTouchPoints !== undefined && maxTouchPoints > 0;
}

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

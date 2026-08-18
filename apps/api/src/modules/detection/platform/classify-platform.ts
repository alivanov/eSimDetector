import type { Platform } from '@esim-detector/contracts';

import type { DetectionSignals } from '../detection-signals';

/**
 * Классификация платформы (docs/03-detection-algorithm.md, §3.3, узел "Платформа?"). Порядок
 * проверок важен: строка User-Agent — самый надёжный источник для iOS/HarmonyOS (Safari и
 * большинство браузеров HarmonyOS не поддерживают UA-CH вовсе), `uaData.platform` — резервный
 * источник для Android/HarmonyOS, когда UA был урезан (Chrome на Android редуцирует UA до
 * `Android 10; K`, но `navigator.userAgentData.platform` при этом доступен).
 */
export function classifyPlatform(signals: DetectionSignals | undefined): Platform {
  const userAgent = signals?.userAgent ?? '';

  if (/iphone|ipad|ipod|cpu (?:iphone )?os \d/i.test(userAgent)) {
    return 'ios';
  }
  if (/harmonyos/i.test(userAgent)) {
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

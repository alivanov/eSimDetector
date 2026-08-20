import { devices } from '@playwright/test';

import type { MobileGpuProfile } from './gpu-spoof';

/**
 * Дескрипторы устройств Playwright (`@playwright/test`, `devices`), использованные тестами этого
 * этапа — перечень пригоден и для сбора сигналов агентом 6.6 через `/debug` (docs/08 §8.3, ADR
 * дельты промпта 6.6). `browserName: 'chromium'` ЗАФИКСИРОВАН для всех профилей, включая iOS:
 * эмуляция устройства в Playwright — это Chromium с подменённой строкой User-Agent, а не настоящий
 * Safari/WebKit на iOS (промпт этапа, ограничения); использование WebKit создало бы иллюзию
 * бо́льшей достоверности проверки, чем она есть на самом деле, и требовало бы установки второго
 * браузера без выигрыша в честности результата.
 *
 * `gpu` — профиль подмены WebGL-рендерера (`./gpu-spoof.ts`): без него ЛЮБОЙ мобильный профиль
 * получает `EMULATION_SUSPECTED` от настоящего API (см. докстринг `gpu-spoof.ts`).
 */
export interface DeviceProfile {
  readonly label: string;
  readonly playwrightDeviceName: keyof typeof devices;
  readonly gpu: MobileGpuProfile;
}

export const PIXEL_7: DeviceProfile = {
  label: 'Google Pixel 7 (Android 14, эмуляция Playwright)',
  playwrightDeviceName: 'Pixel 7',
  gpu: { vendor: 'Qualcomm', renderer: 'Adreno (TM) 740' },
};

export const PIXEL_2: DeviceProfile = {
  label: 'Google Pixel 2 (Android 8.0, эмуляция Playwright)',
  playwrightDeviceName: 'Pixel 2',
  gpu: { vendor: 'Qualcomm', renderer: 'Adreno (TM) 540' },
};

export const IPHONE_13: DeviceProfile = {
  label: 'iPhone 13 (iOS 15, эмуляция Playwright)',
  playwrightDeviceName: 'iPhone 13',
  gpu: { vendor: 'Apple Inc.', renderer: 'Apple GPU' },
};

export const IPHONE_12: DeviceProfile = {
  label: 'iPhone 12 (iOS 14, эмуляция Playwright)',
  playwrightDeviceName: 'iPhone 12',
  gpu: { vendor: 'Apple Inc.', renderer: 'Apple GPU' },
};

export const DESKTOP_CHROME: DeviceProfile = {
  label: 'Desktop Chrome (не мобильное устройство)',
  playwrightDeviceName: 'Desktop Chrome',
  gpu: { vendor: 'Google Inc.', renderer: 'ANGLE (Google, SwiftShader Device, OpenGL ES 3.0)' },
};

import type { Platform } from '@esim-detector/contracts';

import type { DetectionSignals } from '../detection-signals';

/**
 * Обнаружение эмуляции/подмены сигналов (docs/03-detection-algorithm.md, §3.8, п.2): «заявлен
 * iOS/Android при `maxTouchPoints === 0`; строка рендерера WebGL содержит признаки десктопного
 * GPU при мобильном UA». Список маркеров — только программные/десктопные рендереры, для которых
 * ложное срабатывание на реальном мобильном GPU невозможно (в отличие, например, от `Apple M*`,
 * который легитимен на iPad с чипом Apple Silicon).
 */
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

function hasDesktopGpuMarker(renderer: string | undefined): boolean {
  if (renderer === undefined) {
    return false;
  }
  const lower = renderer.toLowerCase();
  return DESKTOP_OR_SOFTWARE_GPU_MARKERS.some((marker) => lower.includes(marker));
}

const MOBILE_PLATFORMS: ReadonlySet<Platform> = new Set(['ios', 'android', 'harmonyos']);

export interface EmulationCheckInput {
  readonly platform: Platform;
  readonly signals: DetectionSignals | undefined;
}

export interface EmulationCheckResult {
  readonly suspected: boolean;
  /** Человекочитаемые детали для `reasons[].detail` (ADR-010) — не для пользователя. */
  readonly details: readonly string[];
}

export function detectEmulation(input: EmulationCheckInput): EmulationCheckResult {
  const details: string[] = [];

  if (!MOBILE_PLATFORMS.has(input.platform)) {
    return { suspected: false, details };
  }

  if (input.signals?.hardware?.maxTouchPoints === 0) {
    details.push('заявлена мобильная платформа, но maxTouchPoints = 0');
  }

  const renderer = input.signals?.webgl?.renderer;
  if (hasDesktopGpuMarker(renderer)) {
    details.push(`рендерер WebGL похож на десктопный/программный: "${renderer ?? ''}"`);
  }

  return { suspected: details.length > 0, details };
}

import type { Page } from '@playwright/test';

export interface MobileGpuProfile {
  readonly vendor: string;
  readonly renderer: string;
}

/**
 * Подменяет `UNMASKED_VENDOR_WEBGL`/`UNMASKED_RENDERER_WEBGL` (`WEBGL_debug_renderer_info`) на
 * правдоподобные значения мобильного GPU ДО того, как код страницы успевает их прочитать
 * (`page.addInitScript`, выполняется в каждом новом документе раньше любого другого скрипта).
 *
 * Это не сглаживание неудобного теста, а обязательная часть эмуляции устройства (документируется
 * этим же файлом, чтобы не потерялось при следующей правке): headless/headed Chromium без
 * настоящего мобильного GPU всегда отдаёт `ANGLE (Google, Vulkan ... (SwiftShader Device ...))`
 * либо `ANGLE (Intel/NVIDIA/AMD ...)` — оба литерально совпадают с маркерами
 * `DESKTOP_OR_SOFTWARE_GPU_MARKERS` (`apps/api/src/modules/detection/emulation/detect-emulation.ts`,
 * docs/03-detection-algorithm.md §3.8, п.2), которые ИМЕННО ЭТО и обязаны отсекать: десктопный
 * браузер, притворяющийся телефоном через подмену User-Agent (ровно наш случай эмуляции
 * устройства). Без подмены рендерера КАЖДЫЙ мобильный сценарий получал бы `EMULATION_SUSPECTED`
 * и уходил в `clarification_required` независимо от остальных сигналов — не дефект защиты от
 * фрода, а прямое следствие того, что автоматизация неотличима от неё по этому одному признаку
 * (см. `docs/08-testing-and-quality.md` §8.3, абзац о находке этого этапа).
 */
export async function spoofMobileGpu(page: Page, gpu: MobileGpuProfile): Promise<void> {
  await page.addInitScript((profile: MobileGpuProfile) => {
    const canvasProto = HTMLCanvasElement.prototype as unknown as Record<string, unknown>;
    const originalGetContext = canvasProto['getContext'] as (
      this: HTMLCanvasElement,
      ...args: unknown[]
    ) => unknown;

    canvasProto['getContext'] = function (this: HTMLCanvasElement, ...args: unknown[]) {
      const context = originalGetContext.apply(this, args);
      const contextId = args[0];
      if (context === null || (contextId !== 'webgl' && contextId !== 'experimental-webgl')) {
        return context;
      }

      const gl = context as unknown as Record<string, unknown>;
      const originalGetExtension = (gl['getExtension'] as (name: string) => unknown).bind(gl);
      const originalGetParameter = (gl['getParameter'] as (parameter: number) => unknown).bind(gl);

      gl['getParameter'] = (parameter: number): unknown => {
        const extension = originalGetExtension('WEBGL_debug_renderer_info') as Record<
          string,
          unknown
        > | null;
        if (extension !== null) {
          if (parameter === extension['UNMASKED_VENDOR_WEBGL']) {
            return profile.vendor;
          }
          if (parameter === extension['UNMASKED_RENDERER_WEBGL']) {
            return profile.renderer;
          }
        }
        return originalGetParameter(parameter);
      };

      return context;
    };
  }, gpu);
}

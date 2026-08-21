import type { Device, EsimConsensus } from '@esim-detector/contracts';

/**
 * Пересчёт согласия статусов кандидатов ОДНОЙ сигнатуры экрана — по сырому `esim.support`
 * (единое значение либо `"mixed"`), а не через `resolveCandidateGroupEsimStatus`
 * (`@esim-detector/esim-rules`). Намеренно зеркалирует `computeConsensus` из
 * `tools/seed/src/pipeline/rebuild-signatures.ts` (docs/09-decisions.md, комментарий там же):
 * пересобранная запись `screen_signatures` обязана проходить инвариант §5.8 п.7
 * (`checkScreenSignatureConsensus`, `@esim-detector/contracts/invariants.ts`), который сравнивает
 * именно сырой статус, а не свёртку через гейт достоверности. Небольшое дублирование с
 * `tools/seed` предпочтено импорту инструмента командной строки внутрь `apps/api` (разные
 * границы развёртывания) и правке `tools/seed/src/pipeline/*`, не относящейся к работе с
 * overrides (см. «Чего не делать» в передаче агента 7).
 */
export function computeScreenSignatureConsensus(devices: readonly Device[]): EsimConsensus {
  const distinct = new Set(devices.map((device) => device.esim.support));
  if (distinct.size === 1) {
    const [only] = distinct;
    if (only !== undefined) {
      return only;
    }
  }
  return 'mixed';
}

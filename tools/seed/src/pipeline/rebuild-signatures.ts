import type { Device, EsimConsensus, ScreenSignatureRecord } from '@esim-detector/contracts';

/**
 * Пересборка `screen_signatures` из принятых записей `devices` (docs/05-data-model.md §5.5,
 * `tools/seed rebuild-signatures`). `esimConsensus` вычисляется ТАК ЖЕ, как его проверяет
 * инвариант §5.8 п.7 (`checkScreenSignatureConsensus`, `@esim-detector/contracts/invariants.ts`):
 * по СЫРОМУ `esim.support` кандидатов сигнатуры (единое значение либо `"mixed"`), а не через
 * `resolveCandidateGroupEsimStatus` (`@esim-detector/esim-rules`) — та функция гейтит результат
 * `dataConfidence` и сворачивает три статуса в `ResultStatus` (без `"conditional"`), что не
 * совпадает с политикой инварианта, написанного для ЭТОЙ же коллекции. Несовпадение между
 * докстрингом `packages/esim-rules/src/group-consensus.ts` ("предназначена для повторного
 * использования при пересборке этой коллекции") и фактической проверкой инварианта — см. отчёт
 * агента 4: пересобранная сигнатура ОБЯЗАНА проходить `validateCatalogInvariants` без нарушений,
 * поэтому здесь применена логика, совпадающая с инвариантом, а не с докстрингом.
 */
export function buildSignatureKey(signature: string, zoomed: boolean): string {
  return `${signature}@${zoomed ? 'zoomed' : 'normal'}`;
}

function computeConsensus(devices: readonly Device[]): EsimConsensus {
  const distinct = new Set(devices.map((device) => device.esim.support));
  if (distinct.size === 1) {
    const [only] = distinct;
    if (only !== undefined) {
      return only;
    }
  }
  return 'mixed';
}

export function rebuildScreenSignatures(
  devices: readonly Device[],
  now: Date,
): readonly ScreenSignatureRecord[] {
  const groups = new Map<string, { signature: string; zoomed: boolean; devices: Device[] }>();

  for (const device of devices) {
    if (device.platform !== 'ios' || device.status !== 'active') {
      continue;
    }
    for (const screenSignature of device.screenSignatures) {
      const signature = `${screenSignature.cssWidth}x${screenSignature.cssHeight}@${screenSignature.dpr}`;
      const key = buildSignatureKey(signature, screenSignature.zoomed);
      const bucket = groups.get(key) ?? { signature, zoomed: screenSignature.zoomed, devices: [] };
      bucket.devices.push(device);
      groups.set(key, bucket);
    }
  }

  const records: ScreenSignatureRecord[] = [];
  for (const group of groups.values()) {
    records.push({
      signature: group.signature,
      zoomed: group.zoomed,
      candidates: group.devices.map((device) => device._id),
      esimConsensus: computeConsensus(group.devices),
      createdAt: now,
      updatedAt: now,
    });
  }
  return records;
}

import type { Device, DeviceScreenSignature } from '@esim-detector/contracts';

/** Тот же формат, что и `tools/seed/src/pipeline/rebuild-signatures.ts` и `screen_signatures.signature`. */
export function buildSignatureString(signature: {
  readonly cssWidth: number;
  readonly cssHeight: number;
  readonly dpr: number;
}): string {
  return `${signature.cssWidth}x${signature.cssHeight}@${signature.dpr}`;
}

/**
 * Все активные устройства iOS, у которых среди `screenSignatures` есть запись с данным
 * `signature` (docs/05 §5.5) — тот же критерий, по которому `ScreenSignatureService.getBySignature`
 * ищет запись в кэше (ключ кэша — голая строка `signature`, без учёта `zoomed`, см.
 * `apps/api/src/modules/detection/ios/build-screen-signature-key.ts`), поэтому пересборка ОДНОЙ
 * записи после решения модератора обязана группировать кандидатов тем же способом, что и
 * реальный горячий путь резолюции — иначе пересобранная запись не будет отвечать на тот же
 * запрос, для которого её строил модератор.
 */
export function collectDevicesForSignature(
  devices: Iterable<Device>,
  signatureString: string,
): { readonly matches: readonly Device[]; readonly zoomed: boolean } {
  const matches: Device[] = [];
  let zoomed = false;
  let found = false;
  for (const device of devices) {
    if (device.platform !== 'ios' || device.status !== 'active') {
      continue;
    }
    const matchedEntry = device.screenSignatures.find(
      (entry: DeviceScreenSignature) => buildSignatureString(entry) === signatureString,
    );
    if (matchedEntry !== undefined) {
      matches.push(device);
      if (!found) {
        zoomed = matchedEntry.zoomed;
        found = true;
      }
    }
  }
  return { matches, zoomed };
}

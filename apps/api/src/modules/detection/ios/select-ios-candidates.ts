import type { Device, ScreenSignatureRecord } from '@esim-detector/contracts';

import type { ApiReason } from '../../../common/response';

import { isVersionWithinRange } from './os-version-range';

/**
 * Отбор кандидатов ветки iOS (docs/03-detection-algorithm.md, §3.5): шаг 1 (правило по версии
 * iOS, по данным `os.minVersion`/`os.maxVersion`) и шаг 2 (сигнатура экрана) дополняют друг
 * друга — «сигнатура `375×667@2` неоднозначна сама по себе, но в сочетании с iOS 17+ однозначно
 * указывает на SE 2/3». Если оба источника дали результат, но их пересечение пусто (сигналы
 * противоречат друг другу или справочник неполон для одного из измерений), используется список
 * сигнатуры экрана — он основан на прямом физическом измерении, тогда как правило по версии ОС
 * лишь исключает часть моделей.
 */
export interface IosCandidateSelection {
  readonly candidates: readonly Device[];
  readonly usedOsVersionRule: boolean;
  readonly usedScreenSignature: boolean;
  readonly reasons: ApiReason[];
}

function selectByOsVersion(
  devices: ReadonlyMap<string, Device>,
  iosVersion: string,
): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const device of devices.values()) {
    if (
      device.platform === 'ios' &&
      device.deviceType === 'phone' &&
      device.status === 'active' &&
      isVersionWithinRange(iosVersion, device.os)
    ) {
      ids.add(device._id);
    }
  }
  return ids;
}

export function selectIosCandidates(
  devices: ReadonlyMap<string, Device>,
  iosVersion: string | undefined,
  screenSignature: ScreenSignatureRecord | undefined,
): IosCandidateSelection {
  const reasons: ApiReason[] = [];
  const osCandidateIds =
    iosVersion === undefined ? undefined : selectByOsVersion(devices, iosVersion);

  if (iosVersion !== undefined) {
    reasons.push({ code: 'IOS_VERSION_IMPLIES_MIN_MODEL', detail: `iOS ${iosVersion}` });
  }

  let candidateIds: readonly string[];
  if (screenSignature !== undefined) {
    reasons.push({ code: 'SCREEN_SIGNATURE_MATCHED', detail: screenSignature.signature });
    if (osCandidateIds !== undefined) {
      const intersected = screenSignature.candidates.filter((id) => osCandidateIds.has(id));
      candidateIds = intersected.length > 0 ? intersected : screenSignature.candidates;
    } else {
      candidateIds = screenSignature.candidates;
    }
  } else {
    reasons.push({ code: 'SCREEN_SIGNATURE_UNKNOWN' });
    candidateIds = osCandidateIds === undefined ? [] : [...osCandidateIds];
  }

  const candidates: Device[] = [];
  for (const id of candidateIds) {
    const device = devices.get(id);
    if (device !== undefined && device.platform === 'ios' && device.status === 'active') {
      candidates.push(device);
    }
  }

  return {
    candidates,
    usedOsVersionRule: iosVersion !== undefined,
    usedScreenSignature: screenSignature !== undefined,
    reasons,
  };
}

import type { ApiReason } from './api/reason';
import type { DeviceType } from './api/enums';
import { deviceTypeTexts } from './texts';

type DeviceTypeReasonCode = keyof typeof deviceTypeTexts.reasonNotices;

const REASON_NOTICE_CODES_SET: ReadonlySet<string> = new Set(
  Object.keys(deviceTypeTexts.reasonNotices),
);

function isReasonNoticeCode(code: string): code is DeviceTypeReasonCode {
  return REASON_NOTICE_CODES_SET.has(code);
}

/**
 * Адресная подпись по типу устройства (docs/06-api-contract.md §6.2, ADR-034; docs/13-branding.md
 * §13.6, «Тип устройства») — ищет первый код из `reasons[]`, для которого есть утверждённый текст.
 * `reasons[].code` — открытое множество строк (AGENTS.md), поэтому поиск идёт по значению, а не
 * по индексу закрытого перечня.
 */
export function findDeviceTypeNotice(reasons: readonly ApiReason[]): string | undefined {
  for (const reason of reasons) {
    if (isReasonNoticeCode(reason.code)) {
      return deviceTypeTexts.reasonNotices[reason.code];
    }
  }
  return undefined;
}

/** Метка типа устройства (docs/13 §13.6) — только для `tablet`/`watch`/`phone`, для остальных нет утверждённого текста. */
export function findDeviceTypeLabel(deviceType: DeviceType): string | undefined {
  if (deviceType === 'tablet' || deviceType === 'watch' || deviceType === 'phone') {
    return deviceTypeTexts.labels[deviceType];
  }
  return undefined;
}

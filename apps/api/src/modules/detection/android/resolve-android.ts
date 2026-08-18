import type { AliasIndex } from '@esim-detector/fuzzy-matcher';
import { lookupAlias, lookupModelCode } from '@esim-detector/fuzzy-matcher';

import type { ApiReason } from '../../../common/response';
import type { DetectionSignals } from '../detection-signals';
import { parseLegacyAndroidModelFromUserAgent } from '../platform/parse-user-agent';

/**
 * Ветка Android/HarmonyOS (docs/03-detection-algorithm.md, §3.4): основной путь — сопоставление
 * `Sec-CH-UA-Model` со справочником (по сервисному коду ЛИБО по маркетинговому названию — Google
 * присылает `"Pixel 8 Pro"`, а не код). При пустом/урезанном (`"K"`) значении — попытка разбора
 * устаревшего User-Agent (Firefox для Android по-прежнему передаёт модель там). Код неизвестен —
 * `clarification_required` (AGENTS.md, предметное правило 1): никакой попытки угадать модель по
 * новизне устройства.
 */
export type AndroidDetectionMethod =
  'ua_client_hints_model' | 'legacy_user_agent_model' | 'unknown';

export interface AndroidResolutionResult {
  readonly deviceId?: string;
  readonly method: AndroidDetectionMethod;
  readonly reasons: ApiReason[];
}

function lookupByCodeOrAlias(
  index: AliasIndex,
  value: string,
): { readonly id: string } | undefined {
  return lookupModelCode(index, value) ?? lookupAlias(index, value);
}

export function resolveAndroidDevice(
  signals: DetectionSignals | undefined,
  aliasIndex: AliasIndex,
): AndroidResolutionResult {
  const reasons: ApiReason[] = [];
  const rawModel = signals?.uaData?.model?.trim();

  if (rawModel !== undefined && rawModel.length > 0 && rawModel.toUpperCase() !== 'K') {
    reasons.push({ code: 'UA_CH_MODEL_RECEIVED', detail: rawModel });
    const device = lookupByCodeOrAlias(aliasIndex, rawModel);
    if (device !== undefined) {
      reasons.push({ code: 'CATALOG_EXACT_MATCH', detail: device.id });
      return { deviceId: device.id, method: 'ua_client_hints_model', reasons };
    }
    reasons.push({ code: 'CATALOG_MODEL_CODE_UNKNOWN', detail: rawModel });
  } else {
    reasons.push({ code: 'UA_CH_MODEL_MISSING_OR_GENERIC' });
  }

  const legacyModel = parseLegacyAndroidModelFromUserAgent(signals?.userAgent);
  if (legacyModel !== undefined) {
    reasons.push({ code: 'LEGACY_UA_MODEL_PARSED', detail: legacyModel });
    const device = lookupByCodeOrAlias(aliasIndex, legacyModel);
    if (device !== undefined) {
      reasons.push({ code: 'CATALOG_EXACT_MATCH', detail: device.id });
      return { deviceId: device.id, method: 'legacy_user_agent_model', reasons };
    }
    reasons.push({ code: 'CATALOG_MODEL_CODE_UNKNOWN', detail: legacyModel });
  }

  return { method: 'unknown', reasons };
}

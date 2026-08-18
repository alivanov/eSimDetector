import type { EsimCondition } from '@esim-detector/contracts';

import type { CsvEsimSupport, DeviceCandidate } from '../domain/types';

/**
 * Сериализация `DeviceCandidate[]` между подкомандами (`import` → `consensus` → `load`) —
 * промежуточный артефакт в `tools/seed/.cache/` (не файл справочника: он не версионируется,
 * ADR-006 остаётся в силе — источник истины — файлы `data/catalog/`, а этот кэш лишь передаёт
 * результат одного шага конвейера следующему в пределах одного запуска CLI).
 *
 * `Date` не переживает `JSON.stringify`/`JSON.parse` как тип — сериализуется в ISO-строку и
 * восстанавливается вручную с проверкой (ADR-016: без утверждений `as` на внешних данных, а
 * кэш на диске — ровно такие данные, пусть и записанные этим же инструментом).
 */

interface SerializedCandidate extends Omit<DeviceCandidate, 'provenance'> {
  readonly provenance: {
    readonly source: string;
    readonly batchId: string;
    readonly importedAt: string;
    readonly lineNumber: number;
  };
}

export function serializeCandidates(candidates: readonly DeviceCandidate[]): unknown {
  return candidates.map((candidate): SerializedCandidate => ({
    ...candidate,
    provenance: {
      ...candidate.provenance,
      importedAt: candidate.provenance.importedAt.toISOString(),
    },
  }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isString(value: unknown): value is string {
  return typeof value === 'string';
}
function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}
function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
function isEsimSupport(value: unknown): value is CsvEsimSupport {
  return isString(value) && ['yes', 'no', 'conditional', 'unknown'].includes(value);
}
function isPlatform(value: unknown): value is DeviceCandidate['platform'] {
  return isString(value) && ['ios', 'android', 'harmonyos', 'other'].includes(value);
}
function isDeviceType(value: unknown): value is DeviceCandidate['deviceType'] {
  return isString(value) && ['phone', 'tablet', 'watch', 'laptop', 'other'].includes(value);
}
function isConditionArray(value: unknown): value is EsimCondition[] {
  if (!Array.isArray(value)) {
    return false;
  }
  return value.every(
    (item) =>
      isRecord(item) &&
      isString(item['scope']) &&
      isString(item['value']) &&
      isString(item['support']) &&
      isString(item['note']),
  );
}

/** Разбирает один элемент кэша, выданного `serializeCandidates` этим же инструментом. Ошибка — `undefined`. */
export function deserializeCandidate(value: unknown): DeviceCandidate | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const {
    id,
    brand,
    brandTitle,
    marketingName,
    family,
    generation,
    modifiers,
    modelCodes,
    platform,
    deviceType,
    releaseYear,
    esimSupport,
    esimConditions,
    provenance,
  } = value;

  if (
    !isString(id) ||
    !isString(brand) ||
    !isString(brandTitle) ||
    !isString(marketingName) ||
    !isString(family) ||
    (generation !== null && !isNumber(generation)) ||
    !isStringArray(modifiers) ||
    !isStringArray(modelCodes) ||
    !isPlatform(platform) ||
    !isDeviceType(deviceType) ||
    !isNumber(releaseYear) ||
    !isEsimSupport(esimSupport) ||
    !isConditionArray(esimConditions) ||
    !isRecord(provenance)
  ) {
    return undefined;
  }

  const { source, batchId, importedAt, lineNumber } = provenance;
  if (!isString(source) || !isString(batchId) || !isString(importedAt) || !isNumber(lineNumber)) {
    return undefined;
  }
  const importedAtDate = new Date(importedAt);
  if (Number.isNaN(importedAtDate.getTime())) {
    return undefined;
  }

  const dualSim = value['dualSim'];
  const maxEsimProfiles = value['maxEsimProfiles'];
  const osMinVersion = value['osMinVersion'];
  const osMaxVersion = value['osMaxVersion'];
  const ruMarket = value['ruMarket'];
  const sourceUrl = value['sourceUrl'];
  const confidenceSelfReported = value['confidenceSelfReported'];
  const notes = value['notes'];

  return {
    id,
    brand,
    brandTitle,
    marketingName,
    family,
    generation,
    modifiers,
    modelCodes,
    platform,
    deviceType,
    releaseYear,
    esimSupport,
    esimConditions,
    ...(isString(dualSim) ? { dualSim } : {}),
    ...(isNumber(maxEsimProfiles) ? { maxEsimProfiles } : {}),
    ...(isString(osMinVersion) ? { osMinVersion } : {}),
    ...(isString(osMaxVersion) ? { osMaxVersion } : {}),
    ...(isString(ruMarket) ? { ruMarket } : {}),
    ...(isString(sourceUrl) ? { sourceUrl } : {}),
    ...(confidenceSelfReported === 'high' ||
    confidenceSelfReported === 'medium' ||
    confidenceSelfReported === 'low'
      ? { confidenceSelfReported }
      : {}),
    ...(isString(notes) ? { notes } : {}),
    provenance: { source, batchId, importedAt: importedAtDate, lineNumber },
  };
}

export function deserializeCandidates(value: unknown): readonly DeviceCandidate[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const result: DeviceCandidate[] = [];
  for (const item of value) {
    const candidate = deserializeCandidate(item);
    if (candidate !== undefined) {
      result.push(candidate);
    }
  }
  return result;
}

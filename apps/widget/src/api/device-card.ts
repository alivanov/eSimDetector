import type { DualSimMode, DeviceType, EsimSupport, Platform } from './enums';
import { isDeviceType, isDualSimMode, isEsimSupport, isPlatform } from './enums';
import { ApiParseError } from './error';
import { requestJson } from './http';
import { isFiniteNumber, isNonEmptyString, isRecord } from './predicates';
import { parseClarification, type Clarification } from './clarification';

/**
 * Форма ответа `GET /api/v1/devices/{id}` (docs/06-api-contract.md §6.4, `DeviceCard`).
 * Разбирается предикатами на границе (ADR-016), без утверждений `as`.
 */
export interface DeviceCardEsim {
  readonly support: EsimSupport;
  readonly dualSim: DualSimMode;
  readonly maxProfiles: number | null;
  /** Для `support: 'conditional'` — тот же блок, что `clarification` ответа поиска, но с `value` у опций. */
  readonly clarifyingQuestion: Clarification | null;
}

export interface DeviceCard {
  readonly id: string;
  readonly brand: string;
  readonly brandTitle: string;
  readonly marketingName: string;
  readonly name: string;
  readonly platform: Platform;
  readonly deviceType: DeviceType;
  readonly esim: DeviceCardEsim;
  readonly dataConfidence: string;
}

function parseClarifyingQuestionFromCard(value: unknown): Clarification | null | undefined {
  if (value === null) {
    return null;
  }
  if (!isRecord(value)) {
    return undefined;
  }
  const { kind: _scopeKind, question, options } = value;
  if (!isNonEmptyString(question) || !Array.isArray(options)) {
    return undefined;
  }
  // В карточке опции — `{ value, label }` (docs/05 §5.4); в блоке `clarification` API — `{ id, label }`.
  const mappedOptions: { id: string; label: string }[] = [];
  for (const item of options) {
    if (!isRecord(item) || !isNonEmptyString(item['value']) || !isNonEmptyString(item['label'])) {
      return undefined;
    }
    mappedOptions.push({ id: item['value'], label: item['label'] });
  }
  if (mappedOptions.length === 0) {
    return undefined;
  }
  return parseClarification({
    kind: 'answer_question',
    question,
    options: mappedOptions,
  });
}

function parseDeviceCardEsim(value: unknown): DeviceCardEsim | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const { support, dualSim, maxProfiles, clarifyingQuestion } = value;
  if (!isEsimSupport(support) || !isDualSimMode(dualSim)) {
    return undefined;
  }
  if (maxProfiles !== null && !isFiniteNumber(maxProfiles)) {
    return undefined;
  }
  const parsedQuestion = parseClarifyingQuestionFromCard(clarifyingQuestion);
  if (parsedQuestion === undefined) {
    return undefined;
  }
  return {
    support,
    dualSim,
    maxProfiles: maxProfiles === null ? null : maxProfiles,
    clarifyingQuestion: parsedQuestion,
  };
}

export function parseDeviceCard(value: unknown): DeviceCard | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const { id, brand, brandTitle, marketingName, name, platform, deviceType, esim, dataConfidence } =
    value;
  const parsedEsim = parseDeviceCardEsim(esim);
  if (
    !isNonEmptyString(id) ||
    !isNonEmptyString(brand) ||
    !isNonEmptyString(brandTitle) ||
    !isNonEmptyString(marketingName) ||
    !isNonEmptyString(name) ||
    !isPlatform(platform) ||
    !isDeviceType(deviceType) ||
    !isNonEmptyString(dataConfidence) ||
    parsedEsim === undefined
  ) {
    return undefined;
  }
  return {
    id,
    brand,
    brandTitle,
    marketingName,
    name,
    platform,
    deviceType,
    esim: parsedEsim,
    dataConfidence,
  };
}

/** `GET /api/v1/devices/{id}` (docs/06 §6.4). `baseUrl` — параметр, не константа (ADR-027). */
export async function getDeviceById(baseUrl: string, deviceId: string): Promise<DeviceCard> {
  const encodedId = encodeURIComponent(deviceId);
  const raw = await requestJson(baseUrl, {
    method: 'GET',
    path: `/api/v1/devices/${encodedId}`,
  });
  const parsed = parseDeviceCard(raw);
  if (parsed === undefined) {
    throw new ApiParseError(`/api/v1/devices/${encodedId}`);
  }
  return parsed;
}

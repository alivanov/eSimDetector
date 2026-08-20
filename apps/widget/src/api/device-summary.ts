import type { DualSimMode, EsimSupport } from './enums';
import { isDualSimMode, isEsimSupport } from './enums';
import { isFiniteNumber, isNonEmptyString, isOptionalString, isRecord } from './predicates';

/** Проекция `Device` в ответах `/detect` и `/devices/search` (docs/06-api-contract.md §6.2/§6.3). */
export interface DeviceEsimSummary {
  readonly support: EsimSupport;
  readonly dualSim: DualSimMode;
  readonly maxProfiles: number | null;
}

export interface DeviceSummary {
  readonly id: string;
  readonly brand: string;
  readonly name: string;
  readonly modelCode?: string;
  readonly esim: DeviceEsimSummary;
}

export interface CandidateSummary {
  readonly id: string;
  readonly name: string;
  readonly esimSupport?: EsimSupport;
}

export interface MatchSummary extends CandidateSummary {
  readonly score: number;
}

function parseDeviceEsimSummary(value: unknown): DeviceEsimSummary | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const { support, dualSim, maxProfiles } = value;
  if (!isEsimSupport(support) || !isDualSimMode(dualSim)) {
    return undefined;
  }
  if (maxProfiles === null) {
    return { support, dualSim, maxProfiles: null };
  }
  if (!isFiniteNumber(maxProfiles)) {
    return undefined;
  }
  return { support, dualSim, maxProfiles };
}

/** `undefined`, если поле `device` в ответе равно `null` — статус группы/поиска без точной модели. */
export function parseDeviceSummary(value: unknown): DeviceSummary | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (!isRecord(value)) {
    return undefined;
  }
  const { id, brand, name, modelCode, esim } = value;
  const parsedEsim = parseDeviceEsimSummary(esim);
  if (
    !isNonEmptyString(id) ||
    !isNonEmptyString(brand) ||
    !isNonEmptyString(name) ||
    !isOptionalString(modelCode) ||
    parsedEsim === undefined
  ) {
    return undefined;
  }
  return {
    id,
    brand,
    name,
    ...(modelCode !== undefined ? { modelCode } : {}),
    esim: parsedEsim,
  };
}

function hasCandidateShape(
  value: Record<string, unknown>,
): value is Record<string, unknown> & { id: string; name: string } {
  const { id, name, esimSupport } = value;
  return (
    isNonEmptyString(id) &&
    isNonEmptyString(name) &&
    (esimSupport === undefined || isEsimSupport(esimSupport))
  );
}

export function parseCandidateSummary(value: unknown): CandidateSummary | undefined {
  if (!isRecord(value) || !hasCandidateShape(value)) {
    return undefined;
  }
  const { id, name, esimSupport } = value;
  return {
    id,
    name,
    ...(isEsimSupport(esimSupport) ? { esimSupport } : {}),
  };
}

export function parseCandidateSummaries(value: unknown): readonly CandidateSummary[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const result: CandidateSummary[] = [];
  for (const item of value) {
    const parsed = parseCandidateSummary(item);
    if (parsed === undefined) {
      return undefined;
    }
    result.push(parsed);
  }
  return result;
}

export function parseMatchSummary(value: unknown): MatchSummary | undefined {
  if (!isRecord(value) || !hasCandidateShape(value)) {
    return undefined;
  }
  const { id, name, esimSupport, score } = value;
  if (!isFiniteNumber(score)) {
    return undefined;
  }
  return {
    id,
    name,
    ...(isEsimSupport(esimSupport) ? { esimSupport } : {}),
    score,
  };
}

export function parseMatchSummaries(value: unknown): readonly MatchSummary[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const result: MatchSummary[] = [];
  for (const item of value) {
    const parsed = parseMatchSummary(item);
    if (parsed === undefined) {
      return undefined;
    }
    result.push(parsed);
  }
  return result;
}

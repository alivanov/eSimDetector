import type { Device, EsimSupport, DualSimMode } from '@esim-detector/contracts';

/** Проекция `Device` в форму ответа `/detect` (docs/06-api-contract.md, §6.2, поле `device`). */
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

/** Проекция кандидата группы/поиска — только то, что нужно для выбора пользователем. */
export interface CandidateSummary {
  readonly id: string;
  readonly name: string;
  readonly esimSupport?: EsimSupport;
}

export interface MatchSummary extends CandidateSummary {
  readonly score: number;
}

export function toDeviceSummary(device: Device): DeviceSummary {
  const firstModelCode = device.modelCodes[0];
  return {
    id: device._id,
    brand: device.brandTitle,
    name: device.displayName,
    ...(firstModelCode !== undefined ? { modelCode: firstModelCode } : {}),
    esim: {
      support: device.esim.support,
      dualSim: device.esim.dualSim,
      maxProfiles: device.esim.maxProfiles,
    },
  };
}

export function toCandidateSummary(device: Device): CandidateSummary {
  return {
    id: device._id,
    name: device.displayName,
    esimSupport: device.esim.support,
  };
}

export function toMatchSummary(device: Device, score: number): MatchSummary {
  return { ...toCandidateSummary(device), score };
}

import type { CatalogInvariantViolation, Device } from '@esim-detector/contracts';
import { validateCatalogInvariants } from '@esim-detector/contracts';

import type { DeviceCandidate, QuarantineEntry, RowNotice } from '../domain/types';
import { buildDevice, toContractSupport } from './build-device';
import { resolveConsensus } from './consensus';
import { assignDataConfidence } from './confidence';
import { computeFamilyAggregates, type FamilyAggregateInput, type FamilyAggregateReportEntry } from './family-aggregate';
import { decideMergeSource } from './merge';

/**
 * Оркестрация шагов 5–7 конвейера (docs/14-catalog-ingestion.md §14.4) над кандидатами ВСЕХ
 * источников: консенсус → слияние с курируемым ядром/правилом Apple → присвоение
 * достоверности → сборка `Device` → агрегация правил уровня линейки для отчёта (ADR-021).
 * Кандидаты приходят уже прошедшими сверку с эталоном (`importSource`, шаг 4) — эта функция
 * ничего не знает про `catalog.reference.json`.
 */
export interface BuildCatalogOptions {
  readonly candidates: readonly DeviceCandidate[];
  readonly curatedDevices: ReadonlyMap<string, Device>;
  readonly now: Date;
  readonly familyMinRecords: number;
}

export interface BuildCatalogResult {
  readonly devices: readonly Device[];
  readonly quarantine: readonly QuarantineEntry[];
  readonly notices: readonly RowNotice[];
  readonly noDataCount: number;
  readonly familyAggregates: readonly FamilyAggregateReportEntry[];
  readonly invariantViolations: readonly CatalogInvariantViolation[];
  readonly curatedAppliedCount: number;
  readonly appleRuleAppliedCount: number;
}

export function buildCatalog(options: BuildCatalogOptions): BuildCatalogResult {
  const { candidates, curatedDevices, now, familyMinRecords } = options;

  const consensusResult = resolveConsensus(candidates);
  const quarantine: QuarantineEntry[] = [...consensusResult.quarantined];
  const notices: RowNotice[] = [];
  const devices: Device[] = [];
  let curatedAppliedCount = 0;
  let appleRuleAppliedCount = 0;

  for (const consensusDevice of consensusResult.accepted) {
    const decision = decideMergeSource(consensusDevice, curatedDevices);
    notices.push(...decision.notices);

    if (decision.source === 'curated' && decision.curatedDevice !== undefined) {
      curatedAppliedCount += 1;
      devices.push(decision.curatedDevice);
      continue;
    }

    if (decision.source === 'rule:apple-generation') {
      appleRuleAppliedCount += 1;
    }

    const finalSupport =
      decision.source === 'rule:apple-generation' && decision.ruleEsimSupport !== undefined
        ? decision.ruleEsimSupport
        : toContractSupport(consensusDevice.esimSupport);

    const dataConfidence = assignDataConfidence(
      decision.source,
      consensusDevice.outcome,
      finalSupport,
      consensusDevice.representative.sourceUrl !== undefined,
    );

    const device = buildDevice({ consensusDevice, mergeDecision: decision, dataConfidence, now });

    // §5.8 инвариант 4: iOS без сигнатур экрана/os.maxVersion не может попасть в справочник —
    // курируемое ядро Apple пусто (docs/appendix-a §А.6), поэтому это ожидаемый исход, а не
    // редкий сбой (docs/14 §14.8: "IOS_FIELDS_MISSING... начнёт работать на каждом импорте" как
    // только появится курируемое ядро).
    if (device.platform === 'ios' && (device.screenSignatures.length === 0 || device.os.maxVersion === null)) {
      notices.push({
        code: 'IOS_FIELDS_MISSING',
        deviceId: device._id,
        detail: 'Платформа iOS без сигнатур экрана/os.maxVersion из курируемого ядра — запись не загружена',
      });
      quarantine.push({
        code: 'IOS_FIELDS_MISSING',
        source: consensusDevice.representative.provenance.source,
        batchId: consensusDevice.representative.provenance.batchId,
        lineNumber: consensusDevice.representative.provenance.lineNumber,
        detail: `Устройство "${device._id}" (iOS) не может быть загружено без курируемых screenSignatures/os.maxVersion`,
        rawBrand: device.brand,
        rawMarketingName: device.marketingName,
      });
      continue;
    }

    devices.push(device);
  }

  const invariantViolations = validateCatalogInvariants(devices).violations;

  const familyInputs: FamilyAggregateInput[] = devices.map((device) => ({
    brand: device.brand,
    family: device.family,
    esimSupport: device.esim.support,
    dataConfidence: device.dataConfidence,
  }));
  const familyAggregates = computeFamilyAggregates(familyInputs, familyMinRecords);

  return {
    devices,
    quarantine,
    notices,
    noDataCount: consensusResult.noDataCount,
    familyAggregates,
    invariantViolations,
    curatedAppliedCount,
    appleRuleAppliedCount,
  };
}

import type {
  CatalogInvariantCode,
  CatalogInvariantViolation,
  Device,
} from '@esim-detector/contracts';
import { validateCatalogInvariants } from '@esim-detector/contracts';

import type { QuarantineCode, DeviceCandidate, QuarantineEntry, RowNotice } from '../domain/types';
import { buildDevice, toContractSupport } from './build-device';
import { resolveConsensus } from './consensus';
import { assignDataConfidence } from './confidence';
import {
  computeFamilyAggregates,
  type FamilyAggregateInput,
  type FamilyAggregateReportEntry,
} from './family-aggregate';
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
  /** Устройства, ГОТОВЫЕ к загрузке — нарушители инвариантов §5.8 уже исключены (ADR-029). */
  readonly devices: readonly Device[];
  readonly quarantine: readonly QuarantineEntry[];
  readonly notices: readonly RowNotice[];
  readonly noDataCount: number;
  readonly familyAggregates: readonly FamilyAggregateReportEntry[];
  /** Нарушения, найденные ДО карантина — полный список для отчёта и прозрачности (ADR-010). */
  readonly invariantViolations: readonly CatalogInvariantViolation[];
  /** Число устройств, исключённых из `devices` за нарушение инвариантов §5.8 (ADR-029). */
  readonly invariantQuarantinedCount: number;
  readonly curatedAppliedCount: number;
  readonly appleRuleAppliedCount: number;
}

/**
 * Коды инвариантов §5.8 переиспользуются как коды карантина БЕЗ переименования (ADR-029) — явная
 * таблица соответствия (а не утверждение типа `as`) даёт компилятору проверить полноту при
 * появлении нового инварианта: забытая запись — ошибка типов, а не тихий пробел в отчёте.
 */
const INVARIANT_TO_QUARANTINE_CODE: Readonly<Record<CatalogInvariantCode, QuarantineCode>> = {
  DUPLICATE_DEVICE_ID: 'DUPLICATE_DEVICE_ID',
  DUPLICATE_MODEL_CODE: 'DUPLICATE_MODEL_CODE',
  CONFLICTING_ALIAS: 'CONFLICTING_ALIAS',
  IOS_SCREEN_SIGNATURES_MISSING: 'IOS_SCREEN_SIGNATURES_MISSING',
  IOS_MAX_VERSION_MISSING: 'IOS_MAX_VERSION_MISSING',
  CONDITIONAL_CONDITIONS_MISSING: 'CONDITIONAL_CONDITIONS_MISSING',
  CONDITIONAL_CLARIFYING_QUESTION_MISSING: 'CONDITIONAL_CLARIFYING_QUESTION_MISSING',
  SUPPORTED_SOURCES_MISSING: 'SUPPORTED_SOURCES_MISSING',
  SCREEN_SIGNATURE_CONSENSUS_MISMATCH: 'SCREEN_SIGNATURE_CONSENSUS_MISMATCH',
  SCREEN_SIGNATURE_UNKNOWN_CANDIDATE: 'SCREEN_SIGNATURE_UNKNOWN_CANDIDATE',
};

interface DeviceOrigin {
  readonly source: string;
  readonly batchId: string;
  readonly lineNumber: number;
}

/** Все устройства, упомянутые нарушением — `deviceIds` для парных инвариантов 2/3, иначе одиночный `deviceId`. */
function violationDeviceIds(violation: CatalogInvariantViolation): readonly string[] {
  if (violation.deviceIds !== undefined) {
    return violation.deviceIds;
  }
  return violation.deviceId !== undefined ? [violation.deviceId] : [];
}

/**
 * Карантинит записи-нарушители §5.8 ПОСЛЕ построения устройств, а не блокирует загрузку целиком
 * (docs/09-decisions.md ADR-029; AGENTS.md, предметное правило 4: "коллизии отправляй в
 * карантин"). Для парных нарушений (`DUPLICATE_MODEL_CODE`, `CONFLICTING_ALIAS`) в карантин
 * уходят ОБЕ (или все) затронутые записи — симметрично тому, как `CODE_COLLISION` уже поступает
 * с внутриисточниковыми коллизиями (docs/14-catalog-ingestion.md §14.3).
 */
function quarantineInvariantViolators(
  devices: readonly Device[],
  violations: readonly CatalogInvariantViolation[],
  originByDeviceId: ReadonlyMap<string, DeviceOrigin>,
): { readonly devices: readonly Device[]; readonly quarantine: readonly QuarantineEntry[] } {
  if (violations.length === 0) {
    return { devices, quarantine: [] };
  }

  const devicesById = new Map(devices.map((device) => [device._id, device]));
  const violatingIds = new Set<string>();
  const quarantine: QuarantineEntry[] = [];

  for (const violation of violations) {
    for (const deviceId of violationDeviceIds(violation)) {
      violatingIds.add(deviceId);
      const device = devicesById.get(deviceId);
      const origin = originByDeviceId.get(deviceId);
      quarantine.push({
        code: INVARIANT_TO_QUARANTINE_CODE[violation.code],
        source: origin?.source ?? 'invariant-check',
        batchId: origin?.batchId ?? 'post-consensus',
        lineNumber: origin?.lineNumber ?? 0,
        detail: violation.message,
        ...(device !== undefined
          ? { rawBrand: device.brand, rawMarketingName: device.marketingName }
          : {}),
      });
    }
  }

  return {
    devices: devices.filter((device) => !violatingIds.has(device._id)),
    quarantine,
  };
}

export function buildCatalog(options: BuildCatalogOptions): BuildCatalogResult {
  const { candidates, curatedDevices, now, familyMinRecords } = options;

  const consensusResult = resolveConsensus(candidates);
  const quarantine: QuarantineEntry[] = [...consensusResult.quarantined];
  const notices: RowNotice[] = [];
  const devices: Device[] = [];
  // Происхождение каждого устройства — для карантинных записей, если оно нарушит инвариант §5.8
  // ПОСЛЕ построения (см. `quarantineInvariantViolators` ниже): курируемое ядро не имеет строки
  // CSV, поэтому для него используется синтетическое происхождение без номера строки.
  const originByDeviceId = new Map<string, DeviceOrigin>();
  let curatedAppliedCount = 0;
  let appleRuleAppliedCount = 0;
  // Идентификаторы курируемого ядра, уже применённые слиянием ниже — остаток (устройства
  // курируемого ядра без единой строки CSV, например всё ядро Apple при пустом импорте,
  // docs/appendix-a §А.8.3) добавляется отдельным проходом ПОСЛЕ основного цикла, см. ниже.
  const appliedCuratedIds = new Set<string>();

  for (const consensusDevice of consensusResult.accepted) {
    const decision = decideMergeSource(consensusDevice, curatedDevices);
    notices.push(...decision.notices);

    if (decision.source === 'curated' && decision.curatedDevice !== undefined) {
      curatedAppliedCount += 1;
      appliedCuratedIds.add(decision.curatedDevice._id);
      devices.push(decision.curatedDevice);
      originByDeviceId.set(decision.curatedDevice._id, {
        source: 'curated',
        batchId: 'curated',
        lineNumber: 0,
      });
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
    if (
      device.platform === 'ios' &&
      (device.screenSignatures.length === 0 || device.os.maxVersion === null)
    ) {
      notices.push({
        code: 'IOS_FIELDS_MISSING',
        deviceId: device._id,
        detail:
          'Платформа iOS без сигнатур экрана/os.maxVersion из курируемого ядра — запись не загружена',
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
    originByDeviceId.set(device._id, {
      source: consensusDevice.representative.provenance.source,
      batchId: consensusDevice.representative.provenance.batchId,
      lineNumber: consensusDevice.representative.provenance.lineNumber,
    });
  }

  // Курируемое ядро побеждает "целиком, даже без строки CSV" (docs/14 §14.4 шаг 6, приоритет 2;
  // .cursor/rules/catalog-data.mdc). Цикл выше применяет курируемую запись ТОЛЬКО когда для того
  // же `id` нашёлся кандидат консенсуса — этого недостаточно, когда у линейки нет ни одной строки
  // CSV вовсе (Apple: docs/appendix-a §А.8.3, "ноль записей с платформой ios"). Без этого прохода
  // курируемое ядро Apple никогда не попадает в `devices`, несмотря на прохождение валидации.
  for (const [id, curatedDevice] of curatedDevices) {
    if (appliedCuratedIds.has(id)) {
      continue;
    }
    curatedAppliedCount += 1;
    devices.push(curatedDevice);
    originByDeviceId.set(id, { source: 'curated', batchId: 'curated', lineNumber: 0 });
  }

  const invariantViolations = validateCatalogInvariants(devices).violations;
  const quarantinedByInvariants = quarantineInvariantViolators(
    devices,
    invariantViolations,
    originByDeviceId,
  );

  const familyInputs: FamilyAggregateInput[] = quarantinedByInvariants.devices.map((device) => ({
    brand: device.brand,
    family: device.family,
    esimSupport: device.esim.support,
    dataConfidence: device.dataConfidence,
  }));
  const familyAggregates = computeFamilyAggregates(familyInputs, familyMinRecords);

  return {
    devices: quarantinedByInvariants.devices,
    quarantine: [...quarantine, ...quarantinedByInvariants.quarantine],
    notices,
    noDataCount: consensusResult.noDataCount,
    familyAggregates,
    invariantViolations,
    invariantQuarantinedCount: devices.length - quarantinedByInvariants.devices.length,
    curatedAppliedCount,
    appleRuleAppliedCount,
  };
}

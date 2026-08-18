import type {
  DataConfidence,
  Device,
  DeviceSource,
  DualSimMode,
  EsimClarifyingQuestion,
  EsimCondition,
  EsimSupport,
  MarketPresenceRu,
} from '@esim-detector/contracts';

import type { ConsensusDevice } from './consensus';
import type { MergeDecision, MergeSource } from './merge';

/** Отображение `CsvEsimSupport` ("yes"/"no"/"conditional") в `EsimSupport` контракта (docs/05 §5.4). */
export function toContractSupport(value: 'yes' | 'no' | 'conditional'): EsimSupport {
  if (value === 'yes') {
    return 'supported';
  }
  if (value === 'no') {
    return 'not_supported';
  }
  return 'conditional';
}

/**
 * Строит вопрос уточнения по региону/версии ОС из разобранных условий (docs/05 §5.4, ADR-007).
 * Формулировки — черновые русскоязычные (AGENTS.md: весь пользовательский текст на русском);
 * финальная вычитка формулировок — открытый вопрос 7 (docs/12-open-questions.md), не в объёме
 * этого агента.
 */
export function buildClarifyingQuestion(
  conditions: readonly EsimCondition[],
): EsimClarifyingQuestion {
  const scope = conditions[0]?.scope ?? 'region';
  if (scope === 'osVersion') {
    return {
      kind: 'osVersion',
      question: 'Какая версия операционной системы установлена на устройстве?',
      options: [
        ...conditions.map((condition) => ({
          value: condition.value,
          label: `До версии ${condition.value}`,
        })),
        { value: 'other', label: 'Другая версия' },
      ],
    };
  }
  return {
    kind: 'region',
    question: 'В каком регионе приобретено устройство?',
    options: [
      ...conditions.map((condition) => ({
        value: condition.value,
        label: `Регион: ${condition.value}`,
      })),
      { value: 'other', label: 'Другой регион' },
    ],
  };
}

function toDualSim(rawDualSim: string | undefined, support: EsimSupport): DualSimMode {
  const known: readonly DualSimMode[] = ['physical+esim', 'dual-esim', 'esim-only', 'none'];
  const match = known.find((value) => value === rawDualSim);
  if (match !== undefined) {
    return match;
  }
  // dual_sim не влияет на статус eSIM (docs/14 §14.5) — консервативный запасной вариант ниже
  // не создаёт ложного ответа по К1, но требует значения, так как схема не допускает "unknown".
  return support === 'not_supported' ? 'none' : 'physical+esim';
}

function toMarketPresence(rawRuMarket: string | undefined): MarketPresenceRu {
  if (rawRuMarket === 'official') {
    return 'official';
  }
  if (rawRuMarket === 'parallel') {
    return 'parallel-import';
  }
  return 'none';
}

/**
 * `sources` записи (docs/05 §5.3, инвариант §5.8 п.6: "supported" требует непустого `sources`).
 * Для `rule:apple-generation` источником является сам документированный детерминированный
 * регламент (ADR-013, docs/14 §14.4 шаг 6, п.3) — это законный, проверяемый источник факта, а
 * не отсутствие источника.
 */
function buildSources(
  sourceUrl: string | undefined,
  provenanceSource: string,
  mergeSource: MergeSource,
  now: Date,
): readonly DeviceSource[] {
  if (sourceUrl !== undefined) {
    return [{ url: sourceUrl, title: `Источник: ${provenanceSource}`, checkedAt: now }];
  }
  if (mergeSource === 'rule:apple-generation') {
    return [
      {
        url: 'docs/09-decisions.md#adr-013',
        title: 'Детерминированное правило Apple по перечню поколений',
        checkedAt: now,
      },
    ];
  }
  return [];
}

function estimatePopularity(releaseYear: number, now: Date): number {
  const span = now.getUTCFullYear() - 2007;
  if (span <= 0) {
    return 0.5;
  }
  const raw = (releaseYear - 2007) / span;
  return Math.min(1, Math.max(0, raw));
}

export interface BuildDeviceInput {
  readonly consensusDevice: ConsensusDevice;
  readonly mergeDecision: MergeDecision;
  readonly dataConfidence: DataConfidence;
  readonly now: Date;
}

/**
 * Собирает запись справочника (docs/05-data-model.md §5.3—5.4) из результата консенсуса и
 * решения слияния (`decideMergeSource`) — ТОЛЬКО для `source: "import"` и
 * `source: "rule:apple-generation"`. Запись `source: "curated"` использует
 * `mergeDecision.curatedDevice` целиком (курируемое ядро побеждает без пересборки).
 */
export function buildDevice(input: BuildDeviceInput): Device {
  const { consensusDevice, mergeDecision, dataConfidence, now } = input;
  const { representative } = consensusDevice;

  const support: EsimSupport =
    mergeDecision.source === 'rule:apple-generation' && mergeDecision.ruleEsimSupport !== undefined
      ? mergeDecision.ruleEsimSupport
      : toContractSupport(consensusDevice.esimSupport);

  const conditions = support === 'conditional' ? consensusDevice.esimConditions : [];
  const displayName = `${representative.brandTitle} ${representative.marketingName}`;

  const aliases = [
    ...new Set(
      [representative.marketingName, displayName, representative.id.replace(/-/g, ' ')].map((value) =>
        value.toLowerCase(),
      ),
    ),
  ];

  const provenanceSource =
    mergeDecision.source === 'rule:apple-generation'
      ? 'rule:apple-generation'
      : `consensus:${consensusDevice.contributingSources.join('+')}`;

  return {
    _id: representative.id,
    brand: representative.brand,
    brandTitle: representative.brandTitle,
    marketingName: representative.marketingName,
    displayName,
    family: representative.family,
    generation: representative.generation,
    modifiers: [...representative.modifiers],
    modelCodes: [...representative.modelCodes],
    aliases,
    platform: representative.platform,
    deviceType: representative.deviceType,
    os: {
      minVersion: representative.osMinVersion ?? null,
      maxVersion: representative.osMaxVersion ?? null,
    },
    screenSignatures: [],
    esim: {
      support,
      dualSim: toDualSim(representative.dualSim, support),
      maxProfiles: representative.maxEsimProfiles ?? null,
      conditions: [...conditions],
      clarifyingQuestion: support === 'conditional' ? buildClarifyingQuestion(conditions) : null,
      notes: representative.notes ?? '',
    },
    releaseYear: representative.releaseYear,
    marketPresenceRu: toMarketPresence(representative.ruMarket),
    popularity: estimatePopularity(representative.releaseYear, now),
    sources: [...buildSources(representative.sourceUrl, provenanceSource, mergeDecision.source, now)],
    dataConfidence,
    provenance: {
      source: provenanceSource,
      batchId: mergeDecision.source === 'rule:apple-generation' ? null : representative.provenance.batchId,
      importedAt: now,
      agreementCount: mergeDecision.source === 'rule:apple-generation' ? null : consensusDevice.agreementCount,
    },
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };
}

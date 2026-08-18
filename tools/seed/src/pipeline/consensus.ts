import type { EsimCondition } from '@esim-detector/contracts';

import type { CsvEsimSupport, DeviceCandidate, QuarantineEntry } from '../domain/types';

/**
 * Консенсус источников (docs/14-catalog-ingestion.md §14.4 шаг 5) — сравнивает кандидатов с
 * ОДНИМ и тем же `id`, пришедших от РАЗНЫХ источников (`provenance.source`). Правило разрешения
 * расхождений: `conditional` перекрывает `yes`/`no` (правило осторожности, ADR-013); прямое
 * противоречие `yes`/`no` без единого `conditional` не разрешается автоматически и уходит в
 * карантин; `unknown` — воздержание, не участвует в сравнении.
 */

export type ConsensusOutcome = 'unanimous' | 'caution-rule' | 'single-source' | 'no-data';

export interface ConsensusDevice {
  readonly representative: DeviceCandidate;
  readonly esimSupport: 'yes' | 'no' | 'conditional';
  readonly esimConditions: readonly EsimCondition[];
  readonly outcome: ConsensusOutcome;
  readonly agreementCount: number;
  readonly contributingSources: readonly string[];
  /** `true` — запись разрешена правилом осторожности и заводит задачу модерации `source_disagreement` (docs/14 §14.5). */
  readonly sourceDisagreement: boolean;
}

export interface ConsensusResult {
  readonly accepted: readonly ConsensusDevice[];
  readonly quarantined: readonly QuarantineEntry[];
  /** Устройства, по которым ни один источник не назвал статус (все `unknown`) — не карантин, просто нет данных. */
  readonly noDataCount: number;
}

function groupById(candidates: readonly DeviceCandidate[]): ReadonlyMap<string, DeviceCandidate[]> {
  const byId = new Map<string, DeviceCandidate[]>();
  for (const candidate of candidates) {
    const bucket = byId.get(candidate.id) ?? [];
    bucket.push(candidate);
    byId.set(candidate.id, bucket);
  }
  return byId;
}

function pickMajority<T>(values: readonly (T | undefined)[]): T | undefined {
  const counts = new Map<T, number>();
  for (const value of values) {
    if (value === undefined) {
      continue;
    }
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  let winner: T | undefined;
  let winnerCount = 0;
  let tie = false;
  for (const [value, count] of counts) {
    if (count > winnerCount) {
      winner = value;
      winnerCount = count;
      tie = false;
    } else if (count === winnerCount) {
      tie = true;
    }
  }
  return tie ? undefined : winner;
}

function conditionKey(condition: EsimCondition): string {
  return `${condition.scope}:${condition.value}:${condition.support}`;
}

function mergeConditions(group: readonly DeviceCandidate[]): readonly EsimCondition[] {
  const seen = new Map<string, EsimCondition>();
  for (const candidate of group) {
    if (candidate.esimSupport !== 'conditional') {
      continue;
    }
    for (const condition of candidate.esimConditions) {
      seen.set(conditionKey(condition), condition);
    }
  }
  return [...seen.values()];
}

/**
 * Собирает представителя записи из группы: поля, не влияющие на статус eSIM, — по большинству
 * (docs/14 §14.5). Поля `dualSim`/`ruMarket`/`osMinVersion`/`osMaxVersion` строятся ЯВНО (а не
 * спредом `...first`), потому что при равенстве большинства результат должен стать
 * "пустым" (полю не присвоено значение, а не унаследовано от первого кандидата группы) —
 * `exactOptionalPropertyTypes` требует именно ОТСУТСТВИЯ ключа, а не `undefined`.
 */
function buildRepresentative(group: readonly DeviceCandidate[]): DeviceCandidate {
  const first = group[0];
  if (first === undefined) {
    throw new Error('Внутренняя ошибка: пустая группа кандидатов консенсуса');
  }
  const modelCodes = [...new Set(group.flatMap((candidate) => candidate.modelCodes))];
  const releaseYear = pickMajority(group.map((candidate) => candidate.releaseYear)) ?? first.releaseYear;
  const dualSim = pickMajority(group.map((candidate) => candidate.dualSim));
  const ruMarket = pickMajority(group.map((candidate) => candidate.ruMarket));
  const osMinVersion = pickMajority(group.map((candidate) => candidate.osMinVersion));
  const osMaxVersion = pickMajority(group.map((candidate) => candidate.osMaxVersion));
  const sourceUrl = group.map((candidate) => candidate.sourceUrl).find((url) => url !== undefined);
  const notes = pickMajority(group.map((candidate) => candidate.notes));
  const confidenceSelfReported = pickMajority(
    group.map((candidate) => candidate.confidenceSelfReported),
  );

  return {
    id: first.id,
    brand: first.brand,
    brandTitle: first.brandTitle,
    marketingName: first.marketingName,
    family: first.family,
    generation: first.generation,
    modifiers: first.modifiers,
    modelCodes,
    platform: first.platform,
    deviceType: first.deviceType,
    releaseYear,
    esimSupport: first.esimSupport,
    esimConditions: first.esimConditions,
    ...(dualSim !== undefined ? { dualSim } : {}),
    ...(first.maxEsimProfiles !== undefined ? { maxEsimProfiles: first.maxEsimProfiles } : {}),
    ...(osMinVersion !== undefined ? { osMinVersion } : {}),
    ...(osMaxVersion !== undefined ? { osMaxVersion } : {}),
    ...(ruMarket !== undefined ? { ruMarket } : {}),
    ...(sourceUrl !== undefined ? { sourceUrl } : {}),
    ...(confidenceSelfReported !== undefined ? { confidenceSelfReported } : {}),
    ...(notes !== undefined ? { notes } : {}),
    provenance: first.provenance,
  };
}

function buildQuarantineEntries(
  group: readonly DeviceCandidate[],
  detail: string,
): readonly QuarantineEntry[] {
  return group.map((candidate) => ({
    code: 'SOURCE_DISAGREEMENT_UNRESOLVED',
    source: candidate.provenance.source,
    batchId: candidate.provenance.batchId,
    lineNumber: candidate.provenance.lineNumber,
    detail,
    rawBrand: candidate.brand,
    rawMarketingName: candidate.marketingName,
  }));
}

/**
 * Один источник учитывается один раз на `id`: если в группе несколько строк с ОДНИМ `source`
 * (несколько партий одного источника упомянули одну модель), берётся ОДНА строка — как консенсус
 * между партиями ОДНОГО источника, а не как два независимых голоса (docs/appendix-a §А.7:
 * "два прогона одной модели считаются одним источником").
 */
function oneCandidatePerSource(group: readonly DeviceCandidate[]): readonly DeviceCandidate[] {
  const bySource = new Map<string, DeviceCandidate>();
  for (const candidate of group) {
    if (!bySource.has(candidate.provenance.source)) {
      bySource.set(candidate.provenance.source, candidate);
    }
  }
  return [...bySource.values()];
}

export function resolveConsensus(candidates: readonly DeviceCandidate[]): ConsensusResult {
  const accepted: ConsensusDevice[] = [];
  const quarantined: QuarantineEntry[] = [];
  let noDataCount = 0;

  for (const rawGroup of groupById(candidates).values()) {
    const group = oneCandidatePerSource(rawGroup);
    const abstaining = group.filter((candidate) => candidate.esimSupport === 'unknown');
    const voting = group.filter((candidate): candidate is DeviceCandidate & {
      esimSupport: 'yes' | 'no' | 'conditional';
    } => candidate.esimSupport !== 'unknown');

    if (voting.length === 0) {
      noDataCount += 1;
      continue;
    }

    const distinctStatuses = new Set(voting.map((candidate) => candidate.esimSupport));
    const contributingSources = voting.map((candidate) => candidate.provenance.source);
    const representative = buildRepresentative([...voting, ...abstaining]);

    if (voting.length === 1) {
      const [only] = voting;
      if (only === undefined) {
        throw new Error('Внутренняя ошибка: единственный голосующий кандидат недоступен');
      }
      accepted.push({
        representative,
        esimSupport: only.esimSupport,
        esimConditions: only.esimSupport === 'conditional' ? only.esimConditions : [],
        outcome: 'single-source',
        agreementCount: 1,
        contributingSources,
        sourceDisagreement: false,
      });
      continue;
    }

    if (distinctStatuses.size === 1) {
      const [status] = distinctStatuses;
      if (status === undefined) {
        throw new Error('Внутренняя ошибка: пустое множество статусов при согласии источников');
      }
      accepted.push({
        representative,
        esimSupport: status,
        esimConditions: status === 'conditional' ? mergeConditions(voting) : [],
        outcome: 'unanimous',
        agreementCount: voting.length,
        contributingSources,
        sourceDisagreement: false,
      });
      continue;
    }

    if (distinctStatuses.has('conditional')) {
      // Правило осторожности (docs/14 §14.5): "conditional" перекрывает "yes" и "no" при любом
      // раскладе, включая трёхсторонний "yes"+"no"+"conditional" — третий источник объясняет
      // расхождение первых двух региональной зависимостью, противоречия нет.
      accepted.push({
        representative,
        esimSupport: 'conditional',
        esimConditions: mergeConditions(voting),
        outcome: 'caution-rule',
        agreementCount: voting.length,
        contributingSources,
        sourceDisagreement: true,
      });
      continue;
    }

    // "yes" против "no" и ни один источник не назвал "conditional" — безопасного разрешения нет.
    quarantined.push(
      ...buildQuarantineEntries(
        voting,
        `Источники расходятся по "${representative.id}": ${[...distinctStatuses].join(', ')} — без "conditional" среди них`,
      ),
    );
  }

  return { accepted, quarantined, noDataCount };
}

export type { CsvEsimSupport };

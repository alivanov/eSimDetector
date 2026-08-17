import type { MatcherDevice } from './types';

/**
 * Точный индекс — первая ступень двухступенчатого отбора кандидатов (docs/04-matching-algorithm.md,
 * §4.6): хеш-таблица «нормализованный псевдоним → устройство» (маркетинговые названия и псевдонимы)
 * плюс отдельный точный индекс сервисных кодов моделей. Оба индекса строятся в памяти процесса из
 * переданного массива устройств (ADR-005), не читают ничего извне.
 *
 * Псевдонимы и сервисные коды нормализуются по-разному: псевдоним — это свободный текст (сравнение
 * без учёта регистра и лишних пробелов), сервисный код — это структурированный идентификатор вида
 * `SM-S928B` (сравнение без учёта регистра, без изменения внутренних разделителей), поэтому у них
 * разные ключи нормализации и разные карты, хотя строит обе один и тот же `buildAliasIndex`.
 *
 * ОБРАБОТКА КОЛЛИЗИЙ (AGENTS.md: «ложный ответ дороже отсутствия ответа»): если один и тот же
 * нормализованный псевдоним или сервисный код указывает на несколько РАЗНЫХ устройств, точный
 * индекс не выбирает одно из них произвольно — такой ключ намеренно исключается из карты
 * поиска (и `lookupAlias`/`lookupModelCode` вернут `undefined`), а сама коллизия попадает в
 * `aliasCollisions`/`modelCodeCollisions` результата. Устройство, снятое с точного индекса из-за
 * коллизии, всё ещё может быть найдено нечётким отбором (docs/05 §5.8, инвариант 2 и 3 —
 * коллизии такого рода вообще не должны проходить валидацию справочника, но индекс не полагается
 * на то, что входные данные всегда её прошли).
 */

function normalizeAliasKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizeModelCodeKey(value: string): string {
  return value.trim().toUpperCase();
}

export interface AliasCollision {
  readonly alias: string;
  readonly deviceIds: readonly string[];
}

export interface ModelCodeCollision {
  readonly modelCode: string;
  readonly deviceIds: readonly string[];
}

export interface AliasIndex {
  readonly aliasToDevice: ReadonlyMap<string, MatcherDevice>;
  readonly modelCodeToDevice: ReadonlyMap<string, MatcherDevice>;
  readonly aliasCollisions: readonly AliasCollision[];
  readonly modelCodeCollisions: readonly ModelCodeCollision[];
}

/** Добавляет устройство-претендента на нормализованный ключ; несколько устройств на один ключ = коллизия. */
function addCandidate(
  candidates: Map<string, Map<string, MatcherDevice>>,
  key: string,
  device: MatcherDevice,
): void {
  if (key.length === 0) {
    return;
  }
  const bucket = candidates.get(key) ?? new Map<string, MatcherDevice>();
  bucket.set(device.id, device);
  candidates.set(key, bucket);
}

interface ResolvedCandidates {
  readonly resolved: ReadonlyMap<string, MatcherDevice>;
  readonly collisions: ReadonlyMap<string, readonly string[]>;
}

/** Разрешает карту «ключ → претенденты» в карту «ключ → устройство» плюс список коллизий. */
function resolveCandidates(
  candidates: ReadonlyMap<string, ReadonlyMap<string, MatcherDevice>>,
): ResolvedCandidates {
  const resolved = new Map<string, MatcherDevice>();
  const collisions = new Map<string, readonly string[]>();

  for (const [key, bucket] of candidates) {
    if (bucket.size === 1) {
      for (const device of bucket.values()) {
        resolved.set(key, device);
      }
      continue;
    }
    collisions.set(key, [...bucket.keys()].sort());
  }

  return { resolved, collisions };
}

/**
 * Строит точный индекс по всем маркетинговым названиям и псевдонимам (карта `aliasToDevice`) и
 * отдельно по сервисным кодам (карта `modelCodeToDevice`) переданных устройств.
 */
export function buildAliasIndex(devices: readonly MatcherDevice[]): AliasIndex {
  const aliasCandidates = new Map<string, Map<string, MatcherDevice>>();
  const modelCodeCandidates = new Map<string, Map<string, MatcherDevice>>();

  for (const device of devices) {
    const aliasKeys = new Set([device.marketingName, ...device.aliases].map(normalizeAliasKey));
    for (const key of aliasKeys) {
      addCandidate(aliasCandidates, key, device);
    }

    const modelCodeKeys = new Set(device.modelCodes.map(normalizeModelCodeKey));
    for (const key of modelCodeKeys) {
      addCandidate(modelCodeCandidates, key, device);
    }
  }

  const aliasResolution = resolveCandidates(aliasCandidates);
  const modelCodeResolution = resolveCandidates(modelCodeCandidates);

  const aliasCollisions: AliasCollision[] = [...aliasResolution.collisions.entries()].map(
    ([alias, deviceIds]) => ({ alias, deviceIds }),
  );
  const modelCodeCollisions: ModelCodeCollision[] = [
    ...modelCodeResolution.collisions.entries(),
  ].map(([modelCode, deviceIds]) => ({ modelCode, deviceIds }));

  return {
    aliasToDevice: aliasResolution.resolved,
    modelCodeToDevice: modelCodeResolution.resolved,
    aliasCollisions,
    modelCodeCollisions,
  };
}

/** Точный поиск устройства по псевдониму или маркетинговому названию (регистр и пробелы не важны). */
export function lookupAlias(index: AliasIndex, alias: string): MatcherDevice | undefined {
  return index.aliasToDevice.get(normalizeAliasKey(alias));
}

/** Точный поиск устройства по сервисному коду модели (регистр не важен, разделители — важны). */
export function lookupModelCode(index: AliasIndex, modelCode: string): MatcherDevice | undefined {
  return index.modelCodeToDevice.get(normalizeModelCodeKey(modelCode));
}

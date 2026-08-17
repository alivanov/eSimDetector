import type { MatcherDevice } from '../types';
import { extractTrigrams } from './trigrams';

/**
 * Инвертированный триграммный индекс: триграмма → множество идентификаторов устройств,
 * дающий множество кандидатов ДО оценки (ADR-005), а не ранжирование — ранжирование
 * реализует агент 2.4 поверх кандидатов, которые вернёт `findTrigramCandidates`.
 *
 * КЛЮЧЕВОЕ ОГРАНИЧЕНИЕ (AGENTS.md, предметное правило 2; docs/04 §4.2, §4.6): ключ индекса
 * для устройства строится ТОЛЬКО из буквенной части `brand`/`family` — без цифры поколения и
 * без модификаторов линейки. Причина: `iphone 12` и `iphone 13` отличаются одной правкой и
 * дают почти единичную триграммную схожесть, поэтому попадание цифры поколения в текст,
 * участвующий в триграммном сравнении, само по себе делает возможным ложное сопоставление —
 * следующий агент (2.4), реализующий жёсткие ограничения, был бы вынужден чинить это уже
 * после того, как неверный кандидат получил завышенную оценку. `buildDeviceTrigramKey` —
 * защитный барьер на входе индекса: даже если `family` when-либо случайно окажется склеен с
 * цифрой или словом-модификатором (данные заполняются вручную/из выгрузки — ADR-013), ключ
 * индекса всё равно их не увидит, потому что модификаторы вычитаются по `device.modifiers`,
 * а цифры — вычёркиваются безусловно.
 */

/** Буквенная часть `brand`+`family` устройства — то, что реально участвует в триграммном сравнении. */
export function buildDeviceTrigramKey(device: MatcherDevice): string {
  const modifierWords = new Set(device.modifiers.map((modifier) => modifier.toLowerCase()));

  const words = `${device.brand} ${device.family}`
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 0)
    .filter((word) => !modifierWords.has(word))
    .map((word) => word.replace(/[0-9]+/g, ''))
    .filter((word) => word.length > 0);

  return words.join(' ');
}

export interface TrigramIndex {
  readonly trigramToDeviceIds: ReadonlyMap<string, ReadonlySet<string>>;
  /** Ключ индекса, фактически построенный для каждого устройства — пригодится в тестах и в отладке. */
  readonly deviceTrigramKeys: ReadonlyMap<string, string>;
}

/** Строит инвертированный триграммный индекс по переданному массиву устройств (ADR-005: в памяти, без обращений к БД). */
export function buildTrigramIndex(devices: readonly MatcherDevice[]): TrigramIndex {
  const trigramToDeviceIds = new Map<string, Set<string>>();
  const deviceTrigramKeys = new Map<string, string>();

  for (const device of devices) {
    const key = buildDeviceTrigramKey(device);
    deviceTrigramKeys.set(device.id, key);

    for (const trigram of extractTrigrams(key)) {
      const bucket = trigramToDeviceIds.get(trigram) ?? new Set<string>();
      bucket.add(device.id);
      trigramToDeviceIds.set(trigram, bucket);
    }
  }

  return { trigramToDeviceIds, deviceTrigramKeys };
}

export interface FindTrigramCandidatesOptions {
  /** Минимальное число общих триграмм с запросом, чтобы устройство попало в кандидаты. По умолчанию `1`. */
  readonly minSharedTrigrams?: number;
}

/**
 * Возвращает идентификаторы устройств-кандидатов по общим триграммам с запросом — множество
 * ДО оценки (ADR-005), отсортированное по убыванию числа общих триграмм и затем по идентификатору
 * для детерминированности результата при равном числе совпадений.
 *
 * `queryText` — ответственность вызывающего кода: сюда должна приходить уже очищенная от цифр и
 * модификаторов буквенная часть запроса (симметрично `buildDeviceTrigramKey`), иначе гарантия
 * «сравниваем только текстовые части» нарушается на стороне запроса, а не индекса.
 */
export function findTrigramCandidates(
  index: TrigramIndex,
  queryText: string,
  options: FindTrigramCandidatesOptions = {},
): readonly string[] {
  const minSharedTrigrams = options.minSharedTrigrams ?? 1;

  const sharedCounts = new Map<string, number>();
  for (const trigram of extractTrigrams(queryText)) {
    const bucket = index.trigramToDeviceIds.get(trigram);
    if (bucket === undefined) {
      continue;
    }
    for (const deviceId of bucket) {
      sharedCounts.set(deviceId, (sharedCounts.get(deviceId) ?? 0) + 1);
    }
  }

  return [...sharedCounts.entries()]
    .filter(([, count]) => count >= minSharedTrigrams)
    .sort(([leftId, leftCount], [rightId, rightCount]) => {
      if (leftCount !== rightCount) {
        return rightCount - leftCount;
      }
      return leftId.localeCompare(rightId);
    })
    .map(([deviceId]) => deviceId);
}

import type { DetectionSignals, RequestHeaderSignals } from './detection-signals';

/**
 * Серверная перекрёстная проверка `Sec-CH-UA-*` (docs/03-detection-algorithm.md, §3.2, последняя
 * строка). Заголовки НЕ являются обязательным сигналом (.cursor/rules/api-boundaries.mdc: «к
 * кросс-доменному адресу они по умолчанию не отправляются») — при отсутствии заголовков либо
 * соответствующих полей `signals.uaData` результат `not_applicable`, а не `inconsistent`.
 */
export type HeaderConsistencyResult = 'consistent' | 'inconsistent' | 'not_applicable';

function normalize(value: string | undefined): string | undefined {
  const trimmed = value?.trim().toLowerCase();
  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
}

export function checkHeaderConsistency(
  signals: DetectionSignals | undefined,
  headers: RequestHeaderSignals,
): HeaderConsistencyResult {
  const signalModel = normalize(signals?.uaData?.model);
  const signalPlatform = normalize(signals?.uaData?.platform);
  const headerModel = normalize(headers.model);
  const headerPlatform = normalize(headers.platform);

  let compared = false;
  let allConsistent = true;

  if (signalModel !== undefined && headerModel !== undefined) {
    compared = true;
    if (signalModel !== headerModel) {
      allConsistent = false;
    }
  }

  if (signalPlatform !== undefined && headerPlatform !== undefined) {
    compared = true;
    if (signalPlatform !== headerPlatform) {
      allConsistent = false;
    }
  }

  if (!compared) {
    return 'not_applicable';
  }
  return allConsistent ? 'consistent' : 'inconsistent';
}

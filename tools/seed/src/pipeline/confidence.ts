import type { DataConfidence, EsimSupport } from '@esim-detector/contracts';

import type { ConsensusOutcome } from './consensus';
import type { MergeSource } from './merge';

/**
 * Присвоение уровня достоверности (docs/14-catalog-ingestion.md §14.4 шаг 7, таблица):
 * `verified` — курируемое ядро либо детерминированное правило (решение модератора применяется
 * ОТДЕЛЬНО, на чтении — не через эту функцию); `derived` — консенсус источников (единогласие
 * либо разрешение правилом осторожности); `unverified` — единственный источник.
 *
 * `SOURCE_MISSING` (docs/14 §14.3 таблица): статус "supported" без источника не может подняться
 * выше `derived` — в этой схеме это уже гарантировано (CSV-путь никогда не даёт `verified` не
 * через курируемое ядро/правило), функция лишь явно это утверждает, а не полагается на порядок вызова.
 */
export function assignDataConfidence(
  mergeSource: MergeSource,
  consensusOutcome: ConsensusOutcome,
  esimSupport: EsimSupport,
  hasSource: boolean,
): DataConfidence {
  if (mergeSource === 'curated' || mergeSource === 'rule:apple-generation') {
    return 'verified';
  }

  const consensusLevel: DataConfidence =
    consensusOutcome === 'single-source' ? 'unverified' : 'derived';

  if (esimSupport === 'supported' && !hasSource && consensusLevel !== 'unverified') {
    return 'derived';
  }
  return consensusLevel;
}

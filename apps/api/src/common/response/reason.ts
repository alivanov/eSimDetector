/**
 * Элемент машиночитаемого объяснения ответа (docs/09-decisions.md, ADR-010). Код — строка, а
 * не объединение всех кодов проекта (`EsimReasonCode` из `@esim-detector/esim-rules`,
 * `MatchReasonCode` из `@esim-detector/fuzzy-matcher`, собственные коды `detection`/`matching`
 * этого приложения) — эндпоинт объединяет причины из разных пакетов в одном массиве, и их
 * общий предок здесь — просто "стабильная строка", как и в примерах docs/06-api-contract.md.
 */
export interface ApiReason {
  readonly code: string;
  readonly detail?: string;
}

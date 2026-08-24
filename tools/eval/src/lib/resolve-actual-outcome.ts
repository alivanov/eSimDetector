/**
 * Фактический исход ответа `/devices/search` для метрик К2.
 *
 * Порядок важен (фаза B): `clarification_required` с непустым `matches` (выбор кандидата) —
 * всегда `clarification`, даже если в ответе по ошибке остался `deviceId`. Иначе лидер группы
 * с вопросом про лоток SIM считался бы `match` (баг `ambiguous-019`).
 *
 * `clarification_required` без matches при непустом `deviceId` — устройство известно, нужен
 * ответ на условие (регион/ОС): для К2 это `match` (модель названа), не уточнение модели.
 *
 * `clarification_required` без matches с `answer_question` / `check_on_device` и `device: null` —
 * группа эквивалентности с общим условием или общим гейтом достоверности (ADR-045): для К2 — `match`.
 *
 * `supported`/`not_supported` при `device: null` — ответ группы эквивалентности (ADR-002).
 */
export type MatchingEvalOutcome = 'match' | 'clarification' | 'not_found';

export function resolveActualOutcome(parsed: {
  readonly status: string;
  readonly deviceId: string | null;
  readonly matchCount: number;
  readonly clarificationKind?: string | null;
}): MatchingEvalOutcome {
  if (parsed.status === 'clarification_required' && parsed.matchCount > 0) {
    return 'clarification';
  }
  if (parsed.deviceId !== null) {
    return 'match';
  }
  if (parsed.status === 'supported' || parsed.status === 'not_supported') {
    return 'match';
  }
  if (
    parsed.status === 'clarification_required' &&
    (parsed.clarificationKind === 'answer_question' ||
      parsed.clarificationKind === 'check_on_device')
  ) {
    return 'match';
  }
  return 'not_found';
}

import { isArrayOf, isNonEmptyString, isRecord } from './predicates';

/**
 * Блок `clarification` (docs/06-api-contract.md §6.2, docs/03-detection-algorithm.md §3.7).
 * Ровно четыре значения `kind` — сценарии уточнения перечислены полностью, закрытым union (в
 * отличие от `reasons[].code` этот перечень — часть контракта диалога, а не открытый реестр
 * причин, поэтому здесь закрытый тип уместен).
 */
export type ClarificationKind =
  'choose_candidate' | 'answer_question' | 'manual_input' | 'check_on_device';

export interface ClarificationOption {
  readonly id: string;
  readonly label: string;
}

export interface Clarification {
  readonly kind: ClarificationKind;
  readonly question: string;
  readonly options?: readonly ClarificationOption[];
}

const CLARIFICATION_KINDS: readonly ClarificationKind[] = [
  'choose_candidate',
  'answer_question',
  'manual_input',
  'check_on_device',
];
const CLARIFICATION_KINDS_SET: ReadonlySet<string> = new Set(CLARIFICATION_KINDS);

function isClarificationKind(value: unknown): value is ClarificationKind {
  return typeof value === 'string' && CLARIFICATION_KINDS_SET.has(value);
}

function isClarificationOption(value: unknown): value is ClarificationOption {
  return isRecord(value) && isNonEmptyString(value['id']) && isNonEmptyString(value['label']);
}

/** `undefined`, если поле `clarification` отсутствует в ответе — статус определён однозначно. */
export function parseClarification(value: unknown): Clarification | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value)) {
    return undefined;
  }
  const { kind, question, options } = value;
  if (!isClarificationKind(kind) || !isNonEmptyString(question)) {
    return undefined;
  }
  if (options !== undefined && !isArrayOf(options, isClarificationOption)) {
    return undefined;
  }
  return {
    kind,
    question,
    ...(options !== undefined ? { options } : {}),
  };
}

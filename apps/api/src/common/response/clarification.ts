/**
 * Блок `clarification` (docs/06-api-contract.md, §6.2) — следующий шаг сценария уточнения
 * (docs/03-detection-algorithm.md, §3.7) в машиночитаемом виде.
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

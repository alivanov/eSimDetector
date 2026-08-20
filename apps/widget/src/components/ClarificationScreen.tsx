import type { Clarification } from '../api/clarification';
import { clarificationTexts, checkScreenTexts, otherCandidateOptionId } from '../texts';

import { CandidateOptionsList, type OptionLike } from './CandidateOptionsList';
import styles from './ClarificationScreen.module.css';

export interface ClarificationScreenProps {
  readonly clarification: Clarification;
  /** `clarification.kind === 'choose_candidate'`, вариант, отличный от `__other__`. */
  readonly onChooseCandidate: (option: OptionLike) => void;
  /** `clarification.kind === 'answer_question'` — `optionId` уходит `context.region` в повторном `/detect`. */
  readonly onAnswerQuestion: (optionId: string) => void;
  /** Переход к ручному поиску — из `__other__`, кнопки отказа или самого кода `manual_input`. */
  readonly onManualInput: () => void;
}

/**
 * Все четыре значения `clarification.kind` (docs/03-detection-algorithm.md §3.7,
 * docs/06-api-contract.md §6.2). Текст вопроса и подписи вариантов — БУКВАЛЬНО из ответа API
 * (docs/13-branding.md §13.6: «ниже — обвязка экрана», а не сам вопрос).
 */
export function ClarificationScreen({
  clarification,
  onChooseCandidate,
  onAnswerQuestion,
  onManualInput,
}: ClarificationScreenProps) {
  const options = clarification.options ?? [];

  switch (clarification.kind) {
    case 'choose_candidate':
      return (
        <div className={styles.screen}>
          <p className={styles.question}>{clarification.question}</p>
          <CandidateOptionsList
            options={options}
            groupLabel={clarificationTexts.optionsGroupLabel}
            onChoose={(option) => {
              if (option.id === otherCandidateOptionId) {
                onManualInput();
              } else {
                onChooseCandidate(option);
              }
            }}
          />
        </div>
      );
    case 'answer_question':
      return (
        <div className={styles.screen}>
          <p className={styles.question}>{clarification.question}</p>
          <CandidateOptionsList
            options={options}
            groupLabel={clarificationTexts.optionsGroupLabel}
            onChoose={(option) => {
              onAnswerQuestion(option.id);
            }}
          />
          <button type="button" className={styles.giveUpButton} onClick={onManualInput}>
            {clarificationTexts.giveUpButton}
          </button>
        </div>
      );
    case 'manual_input':
      return (
        <div className={styles.screen}>
          <p className={styles.question}>{clarification.question}</p>
          <button type="button" className={styles.giveUpButton} onClick={onManualInput}>
            {checkScreenTexts.manualSearchLink}
          </button>
        </div>
      );
    case 'check_on_device':
      return (
        <div className={styles.screen}>
          <p className={styles.question}>{clarification.question}</p>
          <button type="button" className={styles.giveUpButton} onClick={onManualInput}>
            {clarificationTexts.giveUpButton}
          </button>
        </div>
      );
  }
}

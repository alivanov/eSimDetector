import styles from './CandidateOptionsList.module.css';

export interface OptionLike {
  readonly id: string;
  readonly label: string;
}

export interface CandidateOptionsListProps {
  readonly options: readonly OptionLike[];
  readonly groupLabel: string;
  readonly onChoose: (option: OptionLike) => void;
}

/**
 * Список вариантов уточнения — общий для `clarification.kind === 'choose_candidate'` и
 * `'answer_question'` (docs/03-detection-algorithm.md §3.7), а также для выбора модели из
 * `candidates[]` определённого группового ответа (docs/13-branding.md §13.5, действие «Уточнить
 * модель»). Обычные кнопки в `role="group"` — полностью доступны с клавиатуры (Tab/Enter/Space)
 * без дополнительной ARIA-разметки поверх встроенной семантики `<button>`.
 */
export function CandidateOptionsList({ options, groupLabel, onChoose }: CandidateOptionsListProps) {
  return (
    <div className={styles.list} role="group" aria-label={groupLabel}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          className={styles.option}
          onClick={() => {
            onChoose(option);
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

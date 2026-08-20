import type { PresentationAction, Presentation } from '../api/presentation';
import type { ResultStatus } from '../api/enums';

import styles from './ResultCard.module.css';

export interface ResultCardProps {
  readonly status: ResultStatus;
  readonly presentation: Presentation;
  /** Адресная подпись по типу устройства (docs/13-branding.md §13.6) — необязательная. */
  readonly deviceTypeNotice?: string | undefined;
  readonly deviceTypeLabel?: string | undefined;
  readonly onAction: (action: PresentationAction, which: 'primary' | 'secondary') => void;
}

const VARIANT_CLASS: Record<ResultStatus, string | undefined> = {
  supported: styles.supported,
  not_supported: styles.notSupported,
  clarification_required: styles.clarification,
};

interface ActionButtonProps {
  readonly action: PresentationAction;
  readonly variant: 'primary' | 'secondary';
  readonly onClick: (action: PresentationAction) => void;
}

function ActionButton({ action, variant, onClick }: ActionButtonProps) {
  return (
    <button
      type="button"
      className={variant === 'primary' ? styles.primaryButton : styles.secondaryButton}
      onClick={() => {
        onClick(action);
      }}
    >
      {action.label}
    </button>
  );
}

/**
 * Карточка результата — заголовок, пояснение и до двух действий БУКВАЛЬНО из блока `presentation`
 * ответа API (docs/06-api-contract.md §6.2/§6.3, docs/13-branding.md §13.5): текст не
 * переформулируется. У `not_supported` `primaryAction` ОТСУТСТВУЕТ по построению ответа сервера —
 * этот компонент не восполняет его сам, а просто не рендерит кнопку, которой нет в ответе.
 * Оформление «не поддерживает» нейтральное (`styles.notSupported` использует нейтральный токен
 * `resultCard.notSupported`, не `colors.state.error` — ADR-038) — не выглядит как ошибка.
 */
export function ResultCard({
  status,
  presentation,
  deviceTypeNotice,
  deviceTypeLabel,
  onAction,
}: ResultCardProps) {
  return (
    <div className={`${styles.card} ${VARIANT_CLASS[status]}`}>
      {deviceTypeLabel !== undefined ? (
        <span className={styles.badge}>{deviceTypeLabel}</span>
      ) : null}
      <h2 className={styles.title}>{presentation.title}</h2>
      <p className={styles.description}>{presentation.description}</p>
      {deviceTypeNotice !== undefined ? <p className={styles.notice}>{deviceTypeNotice}</p> : null}
      <div className={styles.actions}>
        {presentation.primaryAction !== undefined ? (
          <ActionButton
            action={presentation.primaryAction}
            variant="primary"
            onClick={(action) => {
              onAction(action, 'primary');
            }}
          />
        ) : null}
        {presentation.secondaryAction !== undefined ? (
          <ActionButton
            action={presentation.secondaryAction}
            variant="secondary"
            onClick={(action) => {
              onAction(action, 'secondary');
            }}
          />
        ) : null}
      </div>
    </div>
  );
}

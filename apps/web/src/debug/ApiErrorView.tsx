import type { ApiErrorBody } from '@esim-detector/widget';

import styles from './ApiErrorView.module.css';
import { debugAuxTexts } from './texts';

export interface ApiErrorViewProps {
  readonly error: ApiErrorBody;
}

/**
 * Ошибка взаимодействия (docs/06-api-contract.md §6.5) — код, сообщение сервера (уже на русском,
 * docs/06 §6.1) и `requestId` показаны как есть. `details[]` (например, у `VALIDATION_ERROR`)
 * показаны отдельно — на стенде отладки это главный источник понимания, какая часть введённых
 * сигналов не прошла проверку схемой.
 */
export function ApiErrorView({ error }: ApiErrorViewProps) {
  return (
    <div className={styles.wrapper} role="alert">
      <div className={styles.row}>
        <span className={styles.label}>{debugAuxTexts.apiErrorCodeLabel}:</span>
        <span className={styles.code}>{error.code}</span>
      </div>
      <div className={styles.row}>
        <span className={styles.label}>{debugAuxTexts.apiErrorMessageLabel}:</span>
        <span>{error.message}</span>
      </div>
      <div className={styles.row}>
        <span className={styles.label}>{debugAuxTexts.requestIdLabel}:</span>
        <span className={styles.code}>{error.requestId}</span>
      </div>
      {error.details !== undefined && error.details.length > 0 ? (
        <div>
          <p className={styles.detailsTitle}>{debugAuxTexts.apiErrorDetailsLabel}</p>
          <ul className={styles.detailsList}>
            {error.details.map((detail, index) => (
              <li key={index}>
                {detail.field !== undefined ? `${detail.field}: ` : ''}
                {detail.issue}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

import type { Presentation } from '@esim-detector/widget';

import styles from './PresentationView.module.css';
import { debugAuxTexts } from './texts';

export interface PresentationViewProps {
  readonly presentation: Presentation | undefined;
}

/**
 * Блок «Готовые формулировки» (docs/13-branding.md §13.6) — `title`/`description`/действия
 * БУКВАЛЬНО из блока `presentation` ответа API (docs/06 §6.2, docs/13 §13.5): стенд не
 * переформулирует эти тексты, только показывает их.
 */
export function PresentationView({ presentation }: PresentationViewProps) {
  if (presentation === undefined) {
    return <p className={styles.emptyState}>{debugAuxTexts.noResponseYet}</p>;
  }
  return (
    <div className={styles.section}>
      <p className={styles.title}>{presentation.title}</p>
      <p className={styles.description}>{presentation.description}</p>
      <div className={styles.actions}>
        {presentation.primaryAction !== undefined ? (
          <span>
            primaryAction: «{presentation.primaryAction.label}» ({presentation.primaryAction.kind})
          </span>
        ) : null}
        {presentation.secondaryAction !== undefined ? (
          <span>
            secondaryAction: «{presentation.secondaryAction.label}» (
            {presentation.secondaryAction.kind})
          </span>
        ) : null}
        {presentation.primaryAction === undefined && presentation.secondaryAction === undefined ? (
          <span>{debugAuxTexts.presentationNoAction}</span>
        ) : null}
      </div>
    </div>
  );
}

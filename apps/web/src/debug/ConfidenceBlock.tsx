import styles from './ConfidenceBlock.module.css';
import { debugAuxTexts } from './texts';

export interface ConfidenceBlockProps {
  readonly confidence: number | undefined;
}

/** Отдельный блок «Уверенность» (docs/13-branding.md §13.6) — значение `confidence` буквально из ответа. */
export function ConfidenceBlock({ confidence }: ConfidenceBlockProps) {
  if (confidence === undefined) {
    return <p className={styles.emptyState}>{debugAuxTexts.confidenceNoResponse}</p>;
  }
  const percent = Math.max(0, Math.min(1, confidence)) * 100;
  return (
    <div className={styles.wrapper}>
      <span className={styles.value}>{confidence.toFixed(2)}</span>
      <div className={styles.track} role="presentation">
        <div className={styles.fill} style={{ width: `${String(percent)}%` }} />
      </div>
    </div>
  );
}

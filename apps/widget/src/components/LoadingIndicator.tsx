import styles from './LoadingIndicator.module.css';

export interface LoadingIndicatorProps {
  readonly label: string;
}

/**
 * Индикатор загрузки (docs/13-branding.md §13.6). Текст сопровождения — обязательный проп, а не
 * захардкоженная строка: разные экраны показывают разные загрузки («Определяем ваше
 * устройство…», «Ищем устройство…»).
 */
export function LoadingIndicator({ label }: LoadingIndicatorProps) {
  return (
    <span className={styles.wrapper}>
      <span className={styles.spinner} aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}

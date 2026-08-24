import { useState } from 'react';

import styles from './App.module.css';
import { homeFeedbackTexts } from './homeTexts';

/**
 * Аккордеон обратной связи только на демо-странице (не в виджете заказчика).
 * Шаги — план «Админка и главная» §3.3; адрес отладки относительный.
 */
export function FeedbackImprove() {
  const [open, setOpen] = useState(false);

  return (
    <div className={styles.feedback}>
      <button
        type="button"
        className={styles.feedbackToggle}
        aria-expanded={open}
        onClick={() => {
          setOpen((current) => !current);
        }}
      >
        {homeFeedbackTexts.toggle}
      </button>
      {open ? (
        <ol className={styles.feedbackList}>
          <li className={styles.feedbackItem}>
            {homeFeedbackTexts.step1BeforeLink}
            <a className={styles.feedbackLink} href={homeFeedbackTexts.debugPath}>
              {homeFeedbackTexts.debugLinkLabel}
            </a>
            {homeFeedbackTexts.step1AfterLink}
          </li>
          {homeFeedbackTexts.stepsAfterFirst.map((step) => (
            <li key={step} className={styles.feedbackItem}>
              {step}
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}

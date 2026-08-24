import styles from './admin.module.css';
import { adminTexts } from './texts';

/** Справка для модератора (план «Админка и главная» §1.1) — без ссылок на docs/*. */
export function HelpTab() {
  return (
    <section className={`${styles.section} ${styles.helpProse}`} aria-label={adminTexts.tabHelp}>
      <h2>{adminTexts.helpIntroTitle}</h2>
      <p>{adminTexts.helpIntro}</p>

      <h2>{adminTexts.helpQueueTitle}</h2>
      <p>{adminTexts.helpQueueIntro}</p>
      <ul>
        <li>{adminTexts.helpQueueUnknownModelCode}</li>
        <li>{adminTexts.helpQueueUnknownScreenSignature}</li>
        <li>{adminTexts.helpQueueUnmatchedOrAmbiguous}</li>
        <li>{adminTexts.helpQueueCsvQuarantine}</li>
        <li>{adminTexts.helpQueueSourceDisagreement}</li>
        <li>{adminTexts.helpQueueUserFeedback}</li>
      </ul>

      <h2>{adminTexts.helpDevicesTitle}</h2>
      <p>{adminTexts.helpDevices}</p>

      <h2>{adminTexts.helpChangesTitle}</h2>
      <p>{adminTexts.helpChanges}</p>

      <h2>{adminTexts.helpStatsTitle}</h2>
      <p>{adminTexts.helpStats}</p>

      <h2>{adminTexts.helpEvalTitle}</h2>
      <p>{adminTexts.helpEval}</p>
    </section>
  );
}

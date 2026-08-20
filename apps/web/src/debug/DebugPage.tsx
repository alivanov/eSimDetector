import { useEffect, useState } from 'react';

import type { CatalogMeta } from '@esim-detector/widget';
import { getCatalogMeta } from '@esim-detector/widget';

import { ApiErrorView } from './ApiErrorView';
import type { DebugDetectOutcome } from './api';
import { sendDebugDetect } from './api';
import { collectDebugBrowserSignals, parseSignalsInput, stringifySignals } from './browser-signals';
import { ConfidenceBlock } from './ConfidenceBlock';
import styles from './DebugPage.module.css';
import { GoldenExportForm } from './GoldenExportForm';
import { PresentationView } from './PresentationView';
import { ReasonsTable } from './ReasonsTable';
import { ResponseView } from './ResponseView';
import { debugAuxTexts, debugTexts } from './texts';

/**
 * Относительный адрес API (пустая строка), а не `http://localhost:3000` (ADR-027): при
 * разработке (`vite dev`) и в продакшене (nginx, `apps/web/Dockerfile`) запрос уходит на тот же
 * origin, что и сама страница, и проксируется дальше — тот же приём, что уже применён в `App.tsx`
 * (агент 6.2). Локальный контур работает независимо от значения `CORS_ORIGINS` (задача 6.4, п.3).
 */
const API_BASE = '';

/**
 * Стенд отладки `/debug` (docs/07-integration.md §7.6, ADR-010, docs/13-branding.md §13.6):
 * произвольные сигналы или произвольный User-Agent (через поле `signals.userAgent` JSON ниже) →
 * полный ответ `/detect` с разбором. Стенд НЕ делает собственных заключений о статусе eSIM и не
 * доопределяет модель — всё показанное приходит из ответа API (ограничения задачи 6.4).
 */
export function DebugPage() {
  const [signalsText, setSignalsText] = useState('');
  const [jsonError, setJsonError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<DebugDetectOutcome | undefined>(undefined);
  const [sentSignals, setSentSignals] = useState<unknown>(undefined);
  const [region, setRegion] = useState<string | undefined>(undefined);
  const [catalogMeta, setCatalogMeta] = useState<CatalogMeta | undefined>(undefined);
  const [catalogMetaFailed, setCatalogMetaFailed] = useState(false);

  useEffect(() => {
    void collectDebugBrowserSignals().then((signals) => {
      setSignalsText(stringifySignals(signals));
    });
    void getCatalogMeta(API_BASE)
      .then((meta) => {
        setCatalogMeta(meta);
      })
      .catch(() => {
        setCatalogMetaFailed(true);
      });
    // Один раз при монтировании — операторская страница не переоткрывается без перезагрузки.
  }, []);

  function handleRecollect() {
    void collectDebugBrowserSignals().then((signals) => {
      setSignalsText(stringifySignals(signals));
      setJsonError(false);
    });
  }

  function handleSubmit() {
    const parsed = parseSignalsInput(signalsText);
    if (parsed.kind === 'error') {
      setJsonError(true);
      return;
    }
    setJsonError(false);
    setIsSubmitting(true);
    setRegion(undefined);
    void sendDebugDetect(API_BASE, parsed.value)
      .then((result) => {
        setOutcome(result);
        setSentSignals(parsed.value);
      })
      .finally(() => {
        setIsSubmitting(false);
      });
  }

  function handleAnswerQuestion(optionId: string) {
    setIsSubmitting(true);
    void sendDebugDetect(API_BASE, sentSignals, { region: optionId })
      .then((result) => {
        setOutcome(result);
        setRegion(optionId);
      })
      .finally(() => {
        setIsSubmitting(false);
      });
  }

  const response = outcome?.kind === 'success' ? outcome.response : undefined;

  return (
    <main className={styles.page}>
      <h1 className={styles.heading}>{debugTexts.pageTitle}</h1>

      <p className={styles.catalogInfo}>
        <span>
          {debugAuxTexts.catalogVersionLabel}:{' '}
          {catalogMeta?.version ?? (catalogMetaFailed ? debugAuxTexts.catalogNotAvailable : '…')}
        </span>
        <span>
          {debugAuxTexts.catalogDeviceCountLabel}: {catalogMeta?.deviceCount ?? '—'}
        </span>
        <span>
          {debugAuxTexts.catalogUpdatedAtLabel}: {catalogMeta?.updatedAt ?? '—'}
        </span>
      </p>

      <section className={styles.section} aria-label={debugTexts.signalsBlockTitle}>
        <h2 className={styles.sectionTitle}>{debugTexts.signalsBlockTitle}</h2>
        <label className={styles.fieldLabel} htmlFor="debug-signals-input">
          {debugTexts.signalsFieldLabel}
        </label>
        <textarea
          id="debug-signals-input"
          className={jsonError ? `${styles.textarea} ${styles.textareaError}` : styles.textarea}
          value={signalsText}
          spellCheck={false}
          onChange={(event) => {
            setSignalsText(event.target.value);
            setJsonError(false);
          }}
        />
        {jsonError ? <p className={styles.errorMessage}>{debugTexts.jsonParseError}</p> : null}
        <div className={styles.buttonRow}>
          <button
            type="button"
            className={styles.primaryButton}
            disabled={isSubmitting}
            onClick={handleSubmit}
          >
            {debugTexts.submitButton}
          </button>
          <button type="button" className={styles.secondaryButton} onClick={handleRecollect}>
            {debugTexts.recollectButton}
          </button>
        </div>
      </section>

      <section className={styles.section} aria-label={debugTexts.responseBlockTitle}>
        <h2 className={styles.sectionTitle}>{debugTexts.responseBlockTitle}</h2>
        {outcome === undefined ? <p>{debugAuxTexts.noResponseYet}</p> : null}
        {outcome?.kind === 'network-error' ? (
          <p className={styles.networkErrorMessage} role="alert">
            {debugAuxTexts.networkErrorMessage}
          </p>
        ) : null}
        {outcome?.kind === 'parse-error' ? (
          <p className={styles.networkErrorMessage} role="alert">
            {debugAuxTexts.parseErrorMessage}
          </p>
        ) : null}
        {outcome?.kind === 'api-error' ? <ApiErrorView error={outcome.error} /> : null}
        {outcome?.kind === 'success' ? (
          <ResponseView response={outcome.response} onAnswerQuestion={handleAnswerQuestion} />
        ) : null}
      </section>

      <section className={styles.section} aria-label={debugTexts.reasonsBlockTitle}>
        <h2 className={styles.sectionTitle}>{debugTexts.reasonsBlockTitle}</h2>
        <ReasonsTable reasons={response?.reasons} />
      </section>

      <section className={styles.section} aria-label={debugTexts.confidenceBlockTitle}>
        <h2 className={styles.sectionTitle}>{debugTexts.confidenceBlockTitle}</h2>
        <ConfidenceBlock confidence={response?.confidence} />
      </section>

      <section className={styles.section} aria-label={debugTexts.presentationBlockTitle}>
        <h2 className={styles.sectionTitle}>{debugTexts.presentationBlockTitle}</h2>
        <PresentationView presentation={response?.presentation} />
      </section>

      <section className={styles.section} aria-label={debugAuxTexts.goldenExportSectionTitle}>
        <h2 className={styles.sectionTitle}>{debugAuxTexts.goldenExportSectionTitle}</h2>
        <GoldenExportForm response={response} sentSignals={sentSignals} region={region} />
      </section>
    </main>
  );
}

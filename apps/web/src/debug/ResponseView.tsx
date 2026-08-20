import type { DetectResponse } from '@esim-detector/widget';

import { CopyButton } from './CopyButton';
import styles from './ResponseView.module.css';
import { debugAuxTexts } from './texts';

export interface ResponseViewProps {
  readonly response: DetectResponse | undefined;
  /** `clarification.kind === 'answer_question'` — единственное место стенда, где регион уходит на сервер, и только по явному клику (docs/06 §6.2, ADR-003). */
  readonly onAnswerQuestion: (optionId: string) => void;
}

function boolLabel(value: boolean): string {
  return value ? 'да' : 'нет';
}

/**
 * Полный ответ сервиса «как есть» (ADR-010): `detection` (включая `deviceType`/`method`/
 * `platform`/`exactModelKnown`), `device`, `candidates[]`, `clarification`. Стенд не делает
 * собственных заключений — на iOS `candidates[]` показывается списком без «наиболее вероятного»
 * варианта (AGENTS.md, предметное правило 3).
 */
export function ResponseView({ response, onAnswerQuestion }: ResponseViewProps) {
  if (response === undefined) {
    return <p className={styles.emptyState}>{debugAuxTexts.noResponseYet}</p>;
  }

  const { detection, device, candidates, clarification } = response;

  return (
    <div className={styles.section}>
      <div className={styles.requestIdRow}>
        <span className={styles.requestIdLabel}>{debugAuxTexts.requestIdLabel}:</span>
        <span className={styles.requestIdValue}>{response.requestId}</span>
        <CopyButton value={response.requestId} />
      </div>

      <p className={styles.statusValue}>
        {debugAuxTexts.statusLabel}: {response.status}
      </p>

      <dl className={styles.grid}>
        <dt>{debugAuxTexts.detectionMethodLabel}</dt>
        <dd>{detection.method}</dd>
        <dt>{debugAuxTexts.detectionPlatformLabel}</dt>
        <dd>{detection.platform}</dd>
        <dt>{debugAuxTexts.detectionDeviceTypeLabel}</dt>
        <dd>{detection.deviceType}</dd>
        <dt>{debugAuxTexts.detectionExactModelKnownLabel}</dt>
        <dd>{boolLabel(detection.exactModelKnown)}</dd>
      </dl>

      <h3 className={styles.subheading}>{debugAuxTexts.deviceBlockTitle}</h3>
      {device !== undefined ? (
        <dl className={styles.grid}>
          <dt>id</dt>
          <dd>{device.id}</dd>
          <dt>brand</dt>
          <dd>{device.brand}</dd>
          <dt>name</dt>
          <dd>{device.name}</dd>
          {device.modelCode !== undefined ? (
            <>
              <dt>modelCode</dt>
              <dd>{device.modelCode}</dd>
            </>
          ) : null}
          <dt>esim.support</dt>
          <dd>{device.esim.support}</dd>
          <dt>esim.dualSim</dt>
          <dd>{device.esim.dualSim}</dd>
          <dt>esim.maxProfiles</dt>
          <dd>{device.esim.maxProfiles ?? '—'}</dd>
        </dl>
      ) : (
        <p className={styles.emptyState}>device: null</p>
      )}

      <h3 className={styles.subheading}>{debugAuxTexts.candidatesBlockTitle}</h3>
      {candidates.length > 0 ? (
        <ul className={styles.list}>
          {candidates.map((candidate) => (
            <li key={candidate.id} className={styles.listItem}>
              {candidate.name} ({candidate.id})
              {candidate.esimSupport !== undefined ? ` — ${candidate.esimSupport}` : ''}
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.emptyState}>{debugAuxTexts.candidatesEmpty}</p>
      )}

      <h3 className={styles.subheading}>{debugAuxTexts.clarificationBlockTitle}</h3>
      {clarification !== undefined ? (
        <div className={styles.section}>
          <dl className={styles.grid}>
            <dt>{debugAuxTexts.clarificationKindLabel}</dt>
            <dd>{clarification.kind}</dd>
            <dt>{debugAuxTexts.clarificationQuestionLabel}</dt>
            <dd>{clarification.question}</dd>
          </dl>
          {clarification.options !== undefined && clarification.options.length > 0 ? (
            <>
              <p className={styles.subheading}>{debugAuxTexts.clarificationOptionsLabel}</p>
              <div className={styles.optionsRow} role="group">
                {clarification.options.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={styles.optionButton}
                    disabled={clarification.kind !== 'answer_question'}
                    onClick={() => {
                      onAnswerQuestion(option.id);
                    }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              {clarification.kind === 'answer_question' ? (
                <p className={styles.hint}>{debugAuxTexts.clarificationAnswerHint}</p>
              ) : null}
            </>
          ) : null}
        </div>
      ) : (
        <p className={styles.emptyState}>clarification: —</p>
      )}
    </div>
  );
}

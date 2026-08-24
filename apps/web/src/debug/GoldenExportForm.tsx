import { useEffect, useState } from 'react';

import type { DetectResponse } from '@esim-detector/widget';
import type {
  GoldenDeviceType,
  GoldenExpectedOutcome,
  GoldenPlatform,
  GoldenStatus,
  SignalsGoldenCategory,
  SignalsGoldenSource,
} from '@esim-detector/tools-eval';

import { copyToClipboard } from './clipboard';
import styles from './GoldenExportForm.module.css';
import {
  GOLDEN_CATEGORY_OPTIONS,
  GOLDEN_DEVICE_TYPE_OPTIONS,
  GOLDEN_PLATFORM_OPTIONS,
  GOLDEN_SOURCE_OPTIONS,
  GOLDEN_STATUS_OPTIONS,
  buildExpectedDraft,
  buildGoldenDraft,
  stringifyGoldenDraft,
} from './golden-export';
import { debugAuxTexts, debugTexts } from './texts';

export interface GoldenExportFormProps {
  readonly response: DetectResponse | undefined;
  /** РОВНО то, что отправлено последним запросом `POST /api/v1/detect` (см. `apps/web/src/debug/golden-export.ts`). */
  readonly sentSignals: unknown;
  readonly region: string | undefined;
}

function findOrFirst<T extends string>(options: readonly T[], value: string): T {
  const found = options.find((option) => option === value);
  if (found !== undefined) {
    return found;
  }
  const fallback = options[0];
  if (fallback !== undefined) {
    return fallback;
  }
  throw new Error('findOrFirst: пустой список опций');
}

function FieldLabel({
  htmlFor,
  children,
  required,
}: {
  readonly htmlFor: string;
  readonly children: string;
  readonly required?: boolean;
}) {
  return (
    <label className={styles.label} htmlFor={htmlFor}>
      {children}
      {required === true ? (
        <>
          {' '}
          <span className={styles.requiredMark} aria-hidden="true">
            *
          </span>
          <span className={styles.requiredText}>({debugAuxTexts.goldenExportRequiredMark})</span>
        </>
      ) : null}
    </label>
  );
}

export function GoldenExportForm({ response, sentSignals, region }: GoldenExportFormProps) {
  const [category, setCategory] = useState<SignalsGoldenCategory>(
    GOLDEN_CATEGORY_OPTIONS[0]?.value ?? 'ambiguous-signature',
  );
  const [source, setSource] = useState<SignalsGoldenSource>(
    GOLDEN_SOURCE_OPTIONS[0]?.value ?? 'real-device',
  );
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [expected, setExpected] = useState<GoldenExpectedOutcome | undefined>(undefined);
  const [lastPreparedRequestId, setLastPreparedRequestId] = useState<string | undefined>(undefined);
  const [copied, setCopied] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    if (response !== undefined && response.requestId !== lastPreparedRequestId) {
      setExpected(buildExpectedDraft(response));
      setLastPreparedRequestId(response.requestId);
    }
  }, [response, lastPreparedRequestId]);

  if (response === undefined || expected === undefined) {
    return <p className={styles.unavailable}>{debugAuxTexts.goldenExportUnavailable}</p>;
  }

  const descriptionReady = description.trim().length > 0;
  const draft = buildGoldenDraft({
    category,
    source,
    description,
    signals: sentSignals,
    expected,
    ...(region !== undefined ? { region } : {}),
    ...(notes.length > 0 ? { notes } : {}),
  });
  const preview = stringifyGoldenDraft(draft);

  return (
    <div className={styles.form}>
      <p className={styles.intro}>{debugAuxTexts.goldenExportIntro}</p>

      <div className={styles.help}>
        <button
          type="button"
          className={styles.helpToggle}
          aria-expanded={helpOpen}
          onClick={() => {
            setHelpOpen((current) => !current);
          }}
        >
          {debugAuxTexts.goldenExportHelpToggle}
        </button>
        {helpOpen ? (
          <div className={styles.helpBody}>
            <ol className={styles.helpList}>
              {debugAuxTexts.goldenExportHelpSteps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <p className={styles.helpExampleTitle}>{debugAuxTexts.goldenExportHelpExampleTitle}</p>
            <pre className={styles.helpExample}>{debugAuxTexts.goldenExportHelpExampleBody}</pre>
          </div>
        ) : null}
      </div>

      <div className={styles.fieldWrapper}>
        <FieldLabel htmlFor="golden-category">{debugAuxTexts.goldenExportCategoryLabel}</FieldLabel>
        <select
          id="golden-category"
          className={styles.select}
          value={category}
          onChange={(event) => {
            const next = GOLDEN_CATEGORY_OPTIONS.find(
              (option) => option.value === event.target.value,
            );
            if (next !== undefined) {
              setCategory(next.value);
            }
          }}
        >
          {GOLDEN_CATEGORY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.fieldWrapper}>
        <FieldLabel htmlFor="golden-source">{debugAuxTexts.goldenExportSourceLabel}</FieldLabel>
        <select
          id="golden-source"
          className={styles.select}
          value={source}
          onChange={(event) => {
            const next = GOLDEN_SOURCE_OPTIONS.find(
              (option) => option.value === event.target.value,
            );
            if (next !== undefined) {
              setSource(next.value);
            }
          }}
        >
          {GOLDEN_SOURCE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.fieldWrapper}>
        <FieldLabel htmlFor="golden-description" required>
          {debugAuxTexts.goldenExportDescriptionLabel}
        </FieldLabel>
        <input
          id="golden-description"
          type="text"
          className={styles.input}
          value={description}
          required
          aria-required="true"
          placeholder={debugAuxTexts.goldenExportDescriptionPlaceholder}
          onChange={(event) => {
            setDescription(event.target.value);
          }}
        />
      </div>

      <div className={styles.expectedBlock}>
        <p className={styles.warning}>{debugAuxTexts.goldenExportExpectedWarning}</p>
        <p className={styles.label}>{debugAuxTexts.goldenExportExpectedTitle}</p>
        <div className={styles.expectedGrid}>
          <div className={styles.fieldWrapper}>
            <FieldLabel htmlFor="golden-expected-platform">
              {debugAuxTexts.goldenExportExpectedPlatformLabel}
            </FieldLabel>
            <select
              id="golden-expected-platform"
              className={styles.select}
              value={expected.platform}
              onChange={(event) => {
                const platform: GoldenPlatform = findOrFirst(
                  GOLDEN_PLATFORM_OPTIONS,
                  event.target.value,
                );
                setExpected({ ...expected, platform });
              }}
            >
              {GOLDEN_PLATFORM_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.fieldWrapper}>
            <FieldLabel htmlFor="golden-expected-device-type">
              {debugAuxTexts.goldenExportExpectedDeviceTypeLabel}
            </FieldLabel>
            <select
              id="golden-expected-device-type"
              className={styles.select}
              value={expected.deviceType}
              onChange={(event) => {
                const deviceType: GoldenDeviceType = findOrFirst(
                  GOLDEN_DEVICE_TYPE_OPTIONS,
                  event.target.value,
                );
                setExpected({ ...expected, deviceType });
              }}
            >
              {GOLDEN_DEVICE_TYPE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.fieldWrapper}>
            <FieldLabel htmlFor="golden-expected-status">
              {debugAuxTexts.goldenExportExpectedStatusLabel}
            </FieldLabel>
            <select
              id="golden-expected-status"
              className={styles.select}
              value={expected.status}
              onChange={(event) => {
                const status: GoldenStatus = findOrFirst(GOLDEN_STATUS_OPTIONS, event.target.value);
                setExpected({ ...expected, status });
              }}
            >
              {GOLDEN_STATUS_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.fieldWrapper}>
            <FieldLabel htmlFor="golden-expected-device-id">
              {debugAuxTexts.goldenExportExpectedDeviceIdLabel}
            </FieldLabel>
            <input
              id="golden-expected-device-id"
              type="text"
              className={styles.input}
              value={expected.deviceId ?? ''}
              onChange={(event) => {
                const value = event.target.value;
                setExpected({ ...expected, deviceId: value.length > 0 ? value : null });
              }}
            />
          </div>

          <div className={styles.checkboxRow}>
            <input
              id="golden-expected-exact-model-known"
              type="checkbox"
              checked={expected.exactModelKnown}
              onChange={(event) => {
                setExpected({ ...expected, exactModelKnown: event.target.checked });
              }}
            />
            <label className={styles.label} htmlFor="golden-expected-exact-model-known">
              {debugAuxTexts.goldenExportExpectedExactModelKnownLabel}
            </label>
          </div>
        </div>
      </div>

      <div className={styles.fieldWrapper}>
        <label className={styles.label} htmlFor="golden-notes">
          {debugAuxTexts.goldenExportNotesLabel}{' '}
          <span className={styles.optionalText}>({debugAuxTexts.goldenExportOptionalMark})</span>
        </label>
        <textarea
          id="golden-notes"
          className={styles.textarea}
          rows={2}
          value={notes}
          onChange={(event) => {
            setNotes(event.target.value);
          }}
        />
      </div>

      <p className={styles.label}>{debugAuxTexts.goldenExportPreviewTitle}</p>
      <pre className={styles.preview}>{preview}</pre>

      <button
        type="button"
        className={styles.copyButton}
        disabled={!descriptionReady}
        onClick={() => {
          void copyToClipboard(preview).then((ok) => {
            setCopied(ok);
            if (ok) {
              setTimeout(() => {
                setCopied(false);
              }, 2000);
            }
          });
        }}
      >
        {debugTexts.copyGoldenEntryButton}
      </button>
      {!descriptionReady ? (
        <p className={styles.copyHint}>{debugAuxTexts.goldenExportCopyDisabledHint}</p>
      ) : null}
      {copied ? <p className={styles.status}>{debugAuxTexts.copiedStatus}</p> : null}
    </div>
  );
}

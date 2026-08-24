import { useEffect, useState } from 'react';

import styles from './admin.module.css';
import type { AdminSession } from './TokenGate';
import {
  downloadEvalReport,
  getEvalRun,
  listEvalRuns,
  startEvalRun,
  type EvalRun,
} from './admin-api';
import { adminTexts } from './texts';

interface EvalTabProps {
  readonly session: AdminSession;
}

const POLL_INTERVAL_MS = 2000;

function statusLabel(status: EvalRun['status']): string {
  switch (status) {
    case 'running':
      return adminTexts.evalStatusRunning;
    case 'completed':
      return adminTexts.evalStatusCompleted;
    case 'failed':
      return adminTexts.evalStatusFailed;
  }
}

function phaseLabel(phase: EvalRun['progress']['phase']): string {
  if (phase === 'detection') {
    return adminTexts.evalPhaseDetection;
  }
  if (phase === 'matching') {
    return adminTexts.evalPhaseMatching;
  }
  return '—';
}

function formatSummary(run: EvalRun): string {
  if (run.status === 'failed' && run.errorMessage !== null) {
    return run.errorMessage;
  }
  if (run.summary !== null) {
    return `${run.summary.falsePositives} ${adminTexts.evalFalsePositives} (К1: ${run.summary.detectionFalsePositives}, К2: ${run.summary.matchingFalsePositives})`;
  }
  if (run.status === 'running' && run.progress.total > 0) {
    return `${run.progress.completed} / ${run.progress.total} (${phaseLabel(run.progress.phase)})`;
  }
  return '—';
}

function triggerMarkdownDownload(markdown: string, id: string): void {
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `eval-report-${id}.md`;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** Вкладка «Стенд оценки» (план «Админка и главная» §1.3). */
export function EvalTab({ session }: EvalTabProps) {
  const [runs, setRuns] = useState<readonly EvalRun[] | undefined>(undefined);
  const [activeRunId, setActiveRunId] = useState<string | undefined>(undefined);
  const [activeRun, setActiveRun] = useState<EvalRun | undefined>(undefined);
  const [message, setMessage] = useState<string | undefined>(undefined);
  const [starting, setStarting] = useState(false);

  function refreshList() {
    void listEvalRuns(session.token).then((outcome) => {
      if (outcome.kind === 'success') {
        setRuns(outcome.data.items);
        const running = outcome.data.items.find((item) => item.status === 'running');
        if (running !== undefined) {
          setActiveRunId(running.id);
          setActiveRun(running);
        }
      }
    });
  }

  useEffect(refreshList, [session.token]);

  useEffect(() => {
    if (activeRunId === undefined) {
      return undefined;
    }
    if (activeRun !== undefined && activeRun.status !== 'running') {
      return undefined;
    }

    const timer = window.setInterval(() => {
      void getEvalRun(session.token, activeRunId).then((outcome) => {
        if (outcome.kind !== 'success') {
          return;
        }
        setActiveRun(outcome.data);
        if (outcome.data.status !== 'running') {
          refreshList();
        }
      });
    }, POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, [session.token, activeRunId, activeRun?.status]);

  function handleStart() {
    if (!window.confirm(adminTexts.evalStartConfirm)) {
      return;
    }
    setStarting(true);
    setMessage(undefined);
    void startEvalRun(session.token).then((outcome) => {
      setStarting(false);
      if (outcome.kind === 'success') {
        setActiveRunId(outcome.data.id);
        setActiveRun(outcome.data);
        refreshList();
        return;
      }
      if (outcome.kind === 'error' && outcome.error.code === 'EVAL_RUN_IN_PROGRESS') {
        setMessage(adminTexts.evalStartConflict);
        refreshList();
        return;
      }
      setMessage(adminTexts.evalStartError);
    });
  }

  function handleDownload(id: string) {
    void downloadEvalReport(session.token, id).then((outcome) => {
      if (outcome.kind === 'success') {
        triggerMarkdownDownload(outcome.data, id);
        return;
      }
      setMessage(adminTexts.evalDownloadError);
    });
  }

  if (runs === undefined) {
    return <section className={styles.section} />;
  }

  return (
    <section className={styles.section}>
      <div className={styles.buttonRow}>
        <button
          type="button"
          className={styles.primaryButton}
          onClick={handleStart}
          disabled={starting || activeRun?.status === 'running'}
        >
          {adminTexts.evalStartButton}
        </button>
      </div>
      {message !== undefined ? <p className={styles.errorMessage}>{message}</p> : null}

      {activeRun !== undefined ? (
        <>
          <h3>{adminTexts.evalCurrentTitle}</h3>
          <p>
            {adminTexts.evalColumnStatus}: <strong>{statusLabel(activeRun.status)}</strong>
          </p>
          {activeRun.status === 'running' ? (
            <p>
              {adminTexts.evalProgressLabel}: {activeRun.progress.completed} /{' '}
              {activeRun.progress.total || '…'} ({phaseLabel(activeRun.progress.phase)})
            </p>
          ) : null}
          <p>{formatSummary(activeRun)}</p>
          {activeRun.hasReport ? (
            <div className={styles.buttonRow}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => {
                  handleDownload(activeRun.id);
                }}
              >
                {adminTexts.evalDownloadReport}
              </button>
            </div>
          ) : null}
        </>
      ) : null}

      <h3>{adminTexts.evalHistoryTitle}</h3>
      {runs.length === 0 ? (
        <p>{adminTexts.evalEmpty}</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">{adminTexts.evalColumnWhen}</th>
              <th scope="col">{adminTexts.evalColumnStatus}</th>
              <th scope="col">{adminTexts.evalColumnSummary}</th>
              <th scope="col">{adminTexts.evalColumnReport}</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr key={run.id}>
                <td>{new Date(run.createdAt || run.startedAt).toLocaleString('ru-RU')}</td>
                <td>{statusLabel(run.status)}</td>
                <td>{formatSummary(run)}</td>
                <td>
                  {run.hasReport ? (
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={() => {
                        handleDownload(run.id);
                      }}
                    >
                      {adminTexts.evalDownloadReport}
                    </button>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

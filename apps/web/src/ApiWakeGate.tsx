import { LoadingIndicator } from '@esim-detector/widget';
import { useCallback, useEffect, useState, type ReactNode } from 'react';

import styles from './ApiWakeGate.module.css';
import { homeWakeTexts } from './homeTexts';
import { waitForApiReady } from './wait-for-api-ready';

export interface ApiWakeGateProps {
  readonly apiBase: string;
  readonly children: ReactNode;
}

type WakePhase = 'waiting' | 'ready' | 'failed';

/**
 * На демо-стенде Render API засыпает отдельно от веб-сервиса. Перед монтированием виджета
 * дожидаемся `GET /health/live` и показываем спиннер (docs/16-deployment.md §16.2).
 */
export function ApiWakeGate({ apiBase, children }: ApiWakeGateProps) {
  const [phase, setPhase] = useState<WakePhase>('waiting');

  const runWake = useCallback(() => {
    setPhase('waiting');
    void waitForApiReady({ apiBase })
      .then(() => {
        setPhase('ready');
      })
      .catch(() => {
        setPhase('failed');
      });
  }, [apiBase]);

  useEffect(() => {
    runWake();
  }, [runWake]);

  if (phase === 'ready') {
    return children;
  }

  if (phase === 'failed') {
    return (
      <div className={styles.panel} role="alert">
        <p className={styles.message}>{homeWakeTexts.failed}</p>
        <button type="button" className={styles.retryButton} onClick={runWake}>
          {homeWakeTexts.retry}
        </button>
      </div>
    );
  }

  return (
    <div className={styles.panel}>
      <LoadingIndicator label={homeWakeTexts.loading} />
    </div>
  );
}

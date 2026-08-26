import { LoadingIndicator } from '@esim-detector/widget';
import { useCallback, useEffect, useState, type ReactNode } from 'react';

import styles from './ApiWakeGate.module.css';
import { homeWakeTexts } from './homeTexts';
import { loadRuntimeConfig } from './runtime-config';
import { waitForApiReady } from './wait-for-api-ready';

export type ApiWakePhase = 'waiting' | 'ready' | 'failed';

export interface ApiWakeGateProps {
  readonly apiBase: string;
  readonly children: ReactNode;
  /** Состояние пробуждения: демо скрывает «Хочу улучшить приложение», пока не `ready`. */
  readonly onPhaseChange?: (phase: ApiWakePhase) => void;
}

/**
 * На демо-стенде Render API засыпает отдельно от веб-сервиса. Перед монтированием виджета
 * будим API прямым `GET {apiOrigin}/health/live` (как ручной curl), а не через nginx-прокси
 * веб→API: прокси на спящий Free часто сразу получает `hibernate-rate-limited`
 * (docs/16-deployment.md §16.2).
 */
export function ApiWakeGate({ apiBase, children, onPhaseChange }: ApiWakeGateProps) {
  const [phase, setPhase] = useState<ApiWakePhase>('waiting');

  const setWakePhase = useCallback(
    (next: ApiWakePhase) => {
      setPhase(next);
      onPhaseChange?.(next);
    },
    [onPhaseChange],
  );

  const runWake = useCallback(() => {
    setWakePhase('waiting');
    void loadRuntimeConfig()
      .then((config) =>
        waitForApiReady({
          apiBase,
          ...(config.apiOrigin !== undefined ? { wakeOrigin: config.apiOrigin } : {}),
        }),
      )
      .then(() => {
        setWakePhase('ready');
      })
      .catch(() => {
        setWakePhase('failed');
      });
  }, [apiBase, setWakePhase]);

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

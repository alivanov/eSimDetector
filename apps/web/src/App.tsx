import { EsimChecker } from '@esim-detector/widget';
import { useCallback, useState } from 'react';

import { ApiWakeGate, type ApiWakePhase } from './ApiWakeGate';
import styles from './App.module.css';
import { FeedbackImprove } from './FeedbackImprove';

const DEMO_API_BASE = '';

/**
 * Демонстрационное приложение — тонкая обёртка над `EsimChecker` из `@esim-detector/widget`
 * (docs/02-architecture.md §2.1, ADR-038/ADR-039): собственной бизнес-логики здесь нет, только
 * подключение компонента и адрес API. В разработке Vite проксирует `/api` и `/health` на сервер,
 * поднятый на порту 3000 (`vite.config.ts`, `server.proxy`) — поэтому `apiBase` пустой
 * (относительные пути уходят через тот же порт 8080, что и сама страница).
 *
 * `ApiWakeGate` перед виджетом будит API прямым `/health/live` (docs/16-deployment.md §16.2).
 * Аккордеон «Хочу улучшить приложение» показывается только когда API готов — иначе отвлекает
 * от спиннера пробуждения или кнопки «Повторить».
 *
 * `onPrimaryAction` намеренно не передаётся: на демо нет сценария подключения eSIM, кнопка
 * «Подключить eSIM» скрывается виджетом.
 */
export function App() {
  const [wakePhase, setWakePhase] = useState<ApiWakePhase>('waiting');
  const handlePhaseChange = useCallback((phase: ApiWakePhase) => {
    setWakePhase(phase);
  }, []);

  return (
    <main className={styles.page}>
      <div className={styles.stack}>
        <div className={styles.card}>
          <ApiWakeGate apiBase={DEMO_API_BASE} onPhaseChange={handlePhaseChange}>
            <EsimChecker apiBase={DEMO_API_BASE} channel="web-lk" locale="ru-RU" />
          </ApiWakeGate>
        </div>
        {wakePhase === 'ready' ? <FeedbackImprove /> : null}
      </div>
    </main>
  );
}

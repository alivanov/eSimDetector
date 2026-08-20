import { EsimChecker } from '@esim-detector/widget';

import styles from './App.module.css';

/**
 * Демонстрационное приложение — тонкая обёртка над `EsimChecker` из `@esim-detector/widget`
 * (docs/02-architecture.md §2.1, ADR-038/ADR-039): собственной бизнес-логики здесь нет, только
 * подключение компонента и адрес API. В разработке Vite проксирует `/api` на сервер, поднятый
 * на порту 3000 (`vite.config.ts`, `server.proxy`) — поэтому `apiBase` пустой (относительный путь
 * `/api/v1/...` уходит через тот же порт 8080, что и сама страница).
 */
export function App() {
  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <EsimChecker apiBase="" channel="web-lk" locale="ru-RU" />
      </div>
    </main>
  );
}

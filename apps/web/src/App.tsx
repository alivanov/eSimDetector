import styles from './App.module.css';

/**
 * Демонстрационное приложение — тонкая обёртка над виджетом, без собственной
 * бизнес-логики (docs/02-architecture.md, раздел 2.1). Проверка устройства
 * появится здесь после встраивания виджета в одном из следующих этапов.
 */
export function App() {
  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>eSIM Detector</h1>
        <p className={styles.description}>
          Сервис определения поддержки eSIM вашим устройством. Проверка появится здесь после
          подключения виджета.
        </p>
      </div>
    </main>
  );
}

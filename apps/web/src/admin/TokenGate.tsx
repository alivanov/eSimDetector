import { useState } from 'react';

import styles from './admin.module.css';
import { getStats } from './admin-api';
import { adminTexts } from './texts';

const TOKEN_STORAGE_KEY = 'esim-admin-token';
const MODERATOR_STORAGE_KEY = 'esim-admin-moderator-name';

export interface AdminSession {
  readonly token: string;
  readonly decidedBy: string;
}

interface TokenGateProps {
  readonly onSignedIn: (session: AdminSession) => void;
}

/**
 * Простая авторизация по токену (docs/15-moderation.md §15.7, ADR-025 п.5) — токен проверяется
 * реальным запросом к `GET /api/v1/admin/catalog/stats` (а не локальной эвристикой): раздел
 * закрыт целиком, если `ADMIN_TOKEN` на сервере пуст, и локальная проверка формата строки
 * ничего не гарантирует. Токен и имя модератора сохраняются в `sessionStorage` — только на время
 * вкладки браузера, не переживают перезапуск (демонстрационный стенд, не продуктивный секрет).
 */
export function TokenGate({ onSignedIn }: TokenGateProps) {
  const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_STORAGE_KEY) ?? '');
  const [decidedBy, setDecidedBy] = useState(
    () => sessionStorage.getItem(MODERATOR_STORAGE_KEY) ?? 'moderator',
  );
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState(false);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setChecking(true);
    setError(false);
    void getStats(token)
      .then((outcome) => {
        if (outcome.kind !== 'success') {
          setError(true);
          return;
        }
        sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
        sessionStorage.setItem(MODERATOR_STORAGE_KEY, decidedBy);
        onSignedIn({ token, decidedBy });
      })
      .finally(() => {
        setChecking(false);
      });
  }

  return (
    <main className={styles.page}>
      <h1 className={styles.heading}>{adminTexts.loginTitle}</h1>
      <form className={styles.section} onSubmit={handleSubmit}>
        <label className={styles.fieldLabel} htmlFor="admin-token-input">
          {adminTexts.tokenLabel}
          <input
            id="admin-token-input"
            className={styles.input}
            type="password"
            value={token}
            onChange={(event) => {
              setToken(event.target.value);
            }}
          />
        </label>
        <label className={styles.fieldLabel} htmlFor="admin-moderator-input">
          {adminTexts.moderatorNameLabel}
          <input
            id="admin-moderator-input"
            className={styles.input}
            value={decidedBy}
            onChange={(event) => {
              setDecidedBy(event.target.value);
            }}
          />
        </label>
        {error ? <p className={styles.errorMessage}>{adminTexts.loginError}</p> : null}
        <div className={styles.buttonRow}>
          <button type="submit" className={styles.primaryButton} disabled={checking}>
            {adminTexts.loginButton}
          </button>
        </div>
      </form>
    </main>
  );
}

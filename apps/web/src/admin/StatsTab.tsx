import { useEffect, useState } from 'react';

import styles from './admin.module.css';
import type { AdminSession } from './TokenGate';
import { getStats, reloadCatalog, type CatalogStats } from './admin-api';
import { adminTexts } from './texts';

interface StatsTabProps {
  readonly session: AdminSession;
}

/** Сводка состояния справочника (docs/15-moderation.md §15.7) + перечитывание кэша (§15.8). */
export function StatsTab({ session }: StatsTabProps) {
  const [stats, setStats] = useState<CatalogStats | undefined>(undefined);
  const [reloadMessage, setReloadMessage] = useState<string | undefined>(undefined);

  function refresh() {
    void getStats(session.token).then((outcome) => {
      if (outcome.kind === 'success') {
        setStats(outcome.data);
      }
    });
  }

  useEffect(refresh, [session.token]);

  function handleReload() {
    if (!window.confirm(adminTexts.reloadConfirm)) {
      return;
    }
    void reloadCatalog(session.token).then((outcome) => {
      if (outcome.kind === 'success') {
        setReloadMessage(`${adminTexts.reloadSuccess} (${outcome.data.deviceCount} устройств)`);
        refresh();
      } else {
        setReloadMessage(adminTexts.resolveError);
      }
    });
  }

  if (stats === undefined) {
    return <section className={styles.section} />;
  }

  return (
    <section className={styles.section}>
      <p>
        {adminTexts.statsDeviceCount}: <strong>{stats.deviceCount}</strong>
      </p>
      <p>
        {adminTexts.statsUpdatedAt}: {stats.updatedAt ?? '—'}
      </p>
      <p>
        {adminTexts.statsOpenTasks}: <strong>{stats.openTaskCount}</strong>
      </p>
      <p>
        {adminTexts.statsScreenSignatures}: <strong>{stats.screenSignatureCount}</strong>
      </p>
      {/*
        Пустая производная коллекция при непустом справочнике — не ошибка, а незавершённая
        операционная процедура (docs/07 §7.6), которую нечем было заметить в интерфейсе: сервис
        отвечает и остаётся готовым, просто ветка iOS теряет сужение по экрану (ADR-045).
      */}
      {stats.deviceCount > 0 && stats.screenSignatureCount === 0 ? (
        <p className={styles.errorMessage}>{adminTexts.statsScreenSignaturesEmpty}</p>
      ) : null}

      <h3>{adminTexts.statsByBrand}</h3>
      <pre className={styles.jsonBlock}>{JSON.stringify(stats.byBrand, null, 2)}</pre>

      <h3>{adminTexts.statsByConfidence}</h3>
      <pre className={styles.jsonBlock}>{JSON.stringify(stats.byDataConfidence, null, 2)}</pre>

      <h3>{adminTexts.statsSeedTitle}</h3>
      <p className={styles.seedHint}>{adminTexts.statsSeedBody}</p>

      <div className={styles.buttonRow}>
        <button type="button" className={styles.primaryButton} onClick={handleReload}>
          {adminTexts.reloadButton}
        </button>
      </div>
      {reloadMessage !== undefined ? (
        <p className={styles.successMessage}>{reloadMessage}</p>
      ) : null}
    </section>
  );
}

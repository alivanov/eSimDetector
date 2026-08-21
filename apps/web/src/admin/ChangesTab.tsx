import type { CatalogChangeEntry } from '@esim-detector/contracts';
import { useEffect, useState } from 'react';

import styles from './admin.module.css';
import type { AdminSession } from './TokenGate';
import { listChanges } from './admin-api';
import { adminTexts } from './texts';

interface ChangesTabProps {
  readonly session: AdminSession;
}

/** Журнал изменений (docs/15-moderation.md §15.6) — только для чтения. */
export function ChangesTab({ session }: ChangesTabProps) {
  const [changes, setChanges] = useState<readonly CatalogChangeEntry[]>([]);

  useEffect(() => {
    void listChanges(session.token, {}).then((outcome) => {
      if (outcome.kind === 'success') {
        setChanges(outcome.data.items);
      }
    });
  }, [session.token]);

  return (
    <section className={styles.section}>
      {changes.length === 0 ? (
        <p>{adminTexts.changesEmpty}</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>{adminTexts.changesColumnWhen}</th>
              <th>{adminTexts.changesColumnDevice}</th>
              <th>{adminTexts.changesColumnAction}</th>
              <th>{adminTexts.changesColumnField}</th>
              <th>{adminTexts.changesColumnReason}</th>
              <th>{adminTexts.changesColumnDecidedBy}</th>
            </tr>
          </thead>
          <tbody>
            {changes.map((change) => (
              <tr key={change._id}>
                <td>{new Date(change.createdAt).toLocaleString('ru-RU')}</td>
                <td>{change.deviceId ?? '—'}</td>
                <td>{change.action}</td>
                <td>{change.field ?? '—'}</td>
                <td>{change.reason}</td>
                <td>{change.decidedBy}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

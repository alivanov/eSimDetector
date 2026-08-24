import { useState } from 'react';

import styles from './admin.module.css';
import { ChangesTab } from './ChangesTab';
import { DevicesTab } from './DevicesTab';
import { EvalTab } from './EvalTab';
import { HelpTab } from './HelpTab';
import { StatsTab } from './StatsTab';
import { TasksTab } from './TasksTab';
import { TokenGate, type AdminSession } from './TokenGate';
import { adminTexts } from './texts';

type AdminTab = 'queue' | 'devices' | 'changes' | 'stats' | 'eval' | 'help';

const TABS: readonly { readonly id: AdminTab; readonly label: string }[] = [
  { id: 'queue', label: adminTexts.tabQueue },
  { id: 'devices', label: adminTexts.tabDevices },
  { id: 'changes', label: adminTexts.tabChanges },
  { id: 'stats', label: adminTexts.tabStats },
  { id: 'eval', label: adminTexts.tabEval },
  { id: 'help', label: adminTexts.tabHelp },
];

/**
 * Раздел `/admin` (docs/15-moderation.md §15.7) — очередь задач с подсказками и действиями,
 * поиск/редактирование записи справочника, журнал изменений, сводка состояния справочника,
 * стенд оценки, справка модератора. Без роутера, как и `/debug`: переключение экранов —
 * состояние React.
 */
export function AdminPage() {
  const [session, setSession] = useState<AdminSession | undefined>(undefined);
  const [tab, setTab] = useState<AdminTab>('queue');

  if (session === undefined) {
    return <TokenGate onSignedIn={setSession} />;
  }

  return (
    <main className={styles.page}>
      <div className={styles.headerRow}>
        <h1 className={styles.heading}>{adminTexts.loginTitle}</h1>
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={() => {
            setSession(undefined);
          }}
        >
          {adminTexts.logoutButton}
        </button>
      </div>

      <nav className={styles.tabs}>
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={item.id === tab ? `${styles.tab} ${styles.tabActive}` : styles.tab}
            onClick={() => {
              setTab(item.id);
            }}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {tab === 'queue' ? <TasksTab session={session} /> : null}
      {tab === 'devices' ? <DevicesTab session={session} /> : null}
      {tab === 'changes' ? <ChangesTab session={session} /> : null}
      {tab === 'stats' ? <StatsTab session={session} /> : null}
      {tab === 'eval' ? <EvalTab session={session} /> : null}
      {tab === 'help' ? <HelpTab /> : null}
    </main>
  );
}

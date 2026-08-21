import type {
  ModerationTask,
  ModerationTaskKind,
  ModerationTaskStatus,
} from '@esim-detector/contracts';
import { useEffect, useState } from 'react';

import styles from './admin.module.css';
import type { AdminSession } from './TokenGate';
import {
  getTask,
  listTasks,
  resolveTask,
  type ResolveTaskBody,
  type TaskSuggestions,
} from './admin-api';
import { adminTexts } from './texts';

const KINDS: readonly ModerationTaskKind[] = [
  'unknown_model_code',
  'unknown_screen_signature',
  'unmatched_query',
  'ambiguous_query',
  'csv_quarantine',
  'source_disagreement',
  'user_feedback',
];
const STATUSES: readonly ModerationTaskStatus[] = ['open', 'resolved', 'rejected'];
const ESIM_SUPPORT_OPTIONS: readonly ('supported' | 'not_supported' | 'conditional')[] = [
  'supported',
  'not_supported',
  'conditional',
];

/** Избегает утверждения типа `as` на значении `<select>` (ADR-016) — сужение через `find` по уже известному перечню. */
function findInList<T extends string>(list: readonly T[], value: string): T | undefined {
  return list.find((item) => item === value);
}

function taskSummary(task: ModerationTask): string {
  switch (task.kind) {
    case 'unknown_model_code':
      return `${task.payload.code} (${task.payload.brandGuess ?? '?'})`;
    case 'unknown_screen_signature':
      return task.payload.signature;
    case 'unmatched_query':
    case 'ambiguous_query':
      return task.payload.rawQuery;
    case 'csv_quarantine':
      return `${task.payload.code}: ${task.payload.detail}`;
    case 'source_disagreement':
      return task.payload.deviceId;
    case 'user_feedback':
      return task.payload.comment;
    default:
      return '';
  }
}

interface TasksTabProps {
  readonly session: AdminSession;
}

export function TasksTab({ session }: TasksTabProps) {
  const [kindFilter, setKindFilter] = useState<ModerationTaskKind | ''>('');
  const [statusFilter, setStatusFilter] = useState<ModerationTaskStatus>('open');
  const [tasks, setTasks] = useState<readonly ModerationTask[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | undefined>(undefined);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    void listTasks(session.token, {
      ...(kindFilter !== '' ? { kind: kindFilter } : {}),
      status: statusFilter,
    }).then((outcome) => {
      if (outcome.kind === 'success') {
        setTasks(outcome.data.items);
      }
    });
  }, [session.token, kindFilter, statusFilter, refreshToken]);

  if (selectedTaskId !== undefined) {
    return (
      <TaskDetail
        session={session}
        taskId={selectedTaskId}
        onBack={() => {
          setSelectedTaskId(undefined);
          setRefreshToken((value) => value + 1);
        }}
      />
    );
  }

  return (
    <section className={styles.section}>
      <div className={styles.formGrid}>
        <label className={styles.fieldLabel}>
          {adminTexts.queueFilterKindLabel}
          <select
            className={styles.input}
            value={kindFilter}
            onChange={(event) => {
              setKindFilter(findInList(KINDS, event.target.value) ?? '');
            }}
          >
            <option value="">{adminTexts.queueFilterAllOption}</option>
            {KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {kind}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.fieldLabel}>
          {adminTexts.queueFilterStatusLabel}
          <select
            className={styles.input}
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(findInList(STATUSES, event.target.value) ?? 'open');
            }}
          >
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>
      </div>

      {tasks.length === 0 ? (
        <p>{adminTexts.queueEmpty}</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>{adminTexts.queueOccurrencesColumn}</th>
              <th>{adminTexts.queueKindColumn}</th>
              <th>{adminTexts.queueSummaryColumn}</th>
              <th>{adminTexts.queueStatusColumn}</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((task) => (
              <tr
                key={task._id}
                className={styles.tableRowClickable}
                onClick={() => {
                  setSelectedTaskId(task._id);
                }}
              >
                <td>{task.occurrences}</td>
                <td>{task.kind}</td>
                <td>{taskSummary(task)}</td>
                <td>{task.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

interface TaskDetailProps {
  readonly session: AdminSession;
  readonly taskId: string;
  readonly onBack: () => void;
}

const ACTIONS_BY_KIND: Readonly<Record<ModerationTaskKind, readonly string[]>> = {
  unknown_model_code: ['link_model_code', 'reject'],
  unknown_screen_signature: ['link_screen_signature', 'reject'],
  unmatched_query: ['link_model_code', 'reject'],
  ambiguous_query: ['link_model_code', 'reject'],
  csv_quarantine: ['confirm_quarantine', 'reject_quarantine'],
  source_disagreement: ['resolve_source_disagreement', 'reject'],
  user_feedback: ['acknowledge_feedback', 'reject'],
};

const ACTION_LABELS: Readonly<Record<string, string>> = {
  link_model_code: adminTexts.actionLinkModelCode,
  link_screen_signature: adminTexts.actionLinkScreenSignature,
  confirm_quarantine: adminTexts.actionConfirmQuarantine,
  reject_quarantine: adminTexts.actionRejectQuarantine,
  resolve_source_disagreement: adminTexts.actionResolveSourceDisagreement,
  acknowledge_feedback: adminTexts.actionAcknowledgeFeedback,
  reject: adminTexts.actionReject,
};

function TaskDetail({ session, taskId, onBack }: TaskDetailProps) {
  const [task, setTask] = useState<ModerationTask | undefined>(undefined);
  const [suggestions, setSuggestions] = useState<TaskSuggestions>({});
  const [action, setAction] = useState<string | undefined>(undefined);
  const [deviceId, setDeviceId] = useState('');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [esimSupport, setEsimSupport] = useState<'supported' | 'not_supported' | 'conditional'>(
    'supported',
  );
  const [sourceUrl, setSourceUrl] = useState('');
  const [sourceTitle, setSourceTitle] = useState('');
  const [message, setMessage] = useState<
    { readonly ok: boolean; readonly text: string } | undefined
  >(undefined);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void getTask(session.token, taskId).then((outcome) => {
      if (outcome.kind === 'success') {
        setTask(outcome.data.task);
        setSuggestions(outcome.data.suggestions);
        setAction(ACTIONS_BY_KIND[outcome.data.task.kind][0]);
      }
    });
  }, [session.token, taskId]);

  if (task === undefined || action === undefined) {
    return (
      <section className={styles.section}>
        <button type="button" className={styles.secondaryButton} onClick={onBack}>
          {adminTexts.taskDetailBack}
        </button>
      </section>
    );
  }

  const availableActions = ACTIONS_BY_KIND[task.kind];
  const needsDeviceId =
    action === 'link_model_code' ||
    action === 'link_screen_signature' ||
    action === 'confirm_quarantine' ||
    (action === 'acknowledge_feedback' && esimSupport !== undefined);
  const needsReason = action !== 'reject' && action !== 'reject_quarantine';
  const needsNote = action === 'reject' || action === 'reject_quarantine';
  const needsEsimSupport = action === 'resolve_source_disagreement';
  /**
   * Поле источника показывается для КАЖДОГО действия, меняющего справочник, а не только для
   * «изменить статус eSIM»: уровень достоверности `verified` даёт именно ссылка (docs/15 §15.4),
   * и без этого поля модератор физически не мог выполнить пункт 3 сценария §15.9 («указывает
   * источник и подтверждает привязку») — оставалось вписать ссылку в обоснование, которое
   * источником не считается.
   */
  const needsSource = needsReason;

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (action === undefined) {
      return;
    }
    setSubmitting(true);
    setMessage(undefined);
    const body: ResolveTaskBody = {
      action,
      decidedBy: session.decidedBy,
      ...(needsReason && reason.length > 0 ? { reason } : {}),
      ...(needsDeviceId && deviceId.length > 0 ? { deviceId } : {}),
      ...(needsEsimSupport ? { esimSupport } : {}),
      ...(needsSource && sourceUrl.length > 0 ? { sourceUrl } : {}),
      ...(needsSource && sourceTitle.length > 0 ? { sourceTitle } : {}),
      ...(needsNote && note.length > 0 ? { note } : {}),
    };
    void resolveTask(session.token, taskId, body)
      .then((outcome) => {
        if (outcome.kind === 'success') {
          setMessage({ ok: true, text: adminTexts.resolveSuccess });
        } else if (outcome.kind === 'error') {
          setMessage({ ok: false, text: `${adminTexts.resolveError}: ${outcome.error.message}` });
        } else {
          setMessage({ ok: false, text: adminTexts.resolveError });
        }
      })
      .finally(() => {
        setSubmitting(false);
      });
  }

  return (
    <section className={styles.section}>
      <button type="button" className={styles.secondaryButton} onClick={onBack}>
        {adminTexts.taskDetailBack}
      </button>
      <h2>
        {adminTexts.taskDetailTitle}: {task.kind}
      </h2>
      <pre className={styles.jsonBlock}>{JSON.stringify(task.payload, null, 2)}</pre>

      <h3>{adminTexts.taskDetailSuggestionsTitle}</h3>
      {suggestions.modelCodes === undefined &&
      suggestions.screenSignatures === undefined &&
      suggestions.names === undefined ? (
        <p>{adminTexts.taskDetailNoSuggestions}</p>
      ) : (
        <pre className={styles.jsonBlock}>{JSON.stringify(suggestions, null, 2)}</pre>
      )}

      <form className={styles.formGrid} onSubmit={handleSubmit}>
        <label className={styles.fieldLabel}>
          {adminTexts.actionReject}
          <select
            className={styles.input}
            value={action}
            onChange={(event) => {
              setAction(event.target.value);
            }}
          >
            {availableActions.map((availableAction) => (
              <option key={availableAction} value={availableAction}>
                {ACTION_LABELS[availableAction] ?? availableAction}
              </option>
            ))}
          </select>
        </label>

        {needsDeviceId ? (
          <label className={styles.fieldLabel}>
            {adminTexts.taskDetailDeviceIdLabel}
            <input
              className={styles.input}
              value={deviceId}
              onChange={(event) => {
                setDeviceId(event.target.value);
              }}
            />
          </label>
        ) : null}

        {needsEsimSupport ? (
          <label className={styles.fieldLabel}>
            {adminTexts.taskDetailEsimSupportLabel}
            <select
              className={styles.input}
              value={esimSupport}
              onChange={(event) => {
                setEsimSupport(findInList(ESIM_SUPPORT_OPTIONS, event.target.value) ?? 'supported');
              }}
            >
              <option value="supported">supported</option>
              <option value="not_supported">not_supported</option>
              <option value="conditional">conditional</option>
            </select>
          </label>
        ) : null}

        {needsReason ? (
          <label className={styles.fieldLabel}>
            {adminTexts.taskDetailReasonLabel}
            <input
              className={styles.input}
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
              }}
            />
          </label>
        ) : null}

        {needsSource ? (
          <>
            <label className={styles.fieldLabel}>
              {adminTexts.taskDetailSourceUrlLabel}
              <input
                className={styles.input}
                value={sourceUrl}
                onChange={(event) => {
                  setSourceUrl(event.target.value);
                }}
              />
            </label>
            <label className={styles.fieldLabel}>
              {adminTexts.taskDetailSourceTitleLabel}
              <input
                className={styles.input}
                value={sourceTitle}
                onChange={(event) => {
                  setSourceTitle(event.target.value);
                }}
              />
            </label>
          </>
        ) : null}

        {needsNote ? (
          <label className={styles.fieldLabel}>
            {adminTexts.taskDetailNoteLabel}
            <input
              className={styles.input}
              value={note}
              onChange={(event) => {
                setNote(event.target.value);
              }}
            />
          </label>
        ) : null}

        <div className={styles.buttonRow}>
          <button type="submit" className={styles.primaryButton} disabled={submitting}>
            {ACTION_LABELS[action] ?? action}
          </button>
        </div>
      </form>

      {message !== undefined ? (
        <p className={message.ok ? styles.successMessage : styles.errorMessage}>{message.text}</p>
      ) : null}
    </section>
  );
}

import type { DataConfidence, Device, DeviceType, EsimSupport } from '@esim-detector/contracts';
import { useState } from 'react';

import styles from './admin.module.css';
import type { AdminSession } from './TokenGate';
import { addAlias, createDevice, searchDevices, updateDevice } from './admin-api';
import { adminTexts } from './texts';

const ESIM_SUPPORT_OPTIONS: readonly EsimSupport[] = ['supported', 'not_supported', 'conditional'];
const DATA_CONFIDENCE_OPTIONS: readonly DataConfidence[] = [
  'verified',
  'derived',
  'unverified',
  'quarantined',
];
const DEVICE_TYPE_OPTIONS: readonly DeviceType[] = ['phone', 'tablet', 'watch', 'laptop', 'other'];
const PLATFORM_OPTIONS: readonly ('ios' | 'android' | 'harmonyos' | 'other')[] = [
  'ios',
  'android',
  'harmonyos',
  'other',
];

function findInList<T extends string>(list: readonly T[], value: string): T | undefined {
  return list.find((item) => item === value);
}

interface DevicesTabProps {
  readonly session: AdminSession;
}

export function DevicesTab({ session }: DevicesTabProps) {
  const [query, setQuery] = useState('');
  const [devices, setDevices] = useState<readonly Device[]>([]);
  const [selected, setSelected] = useState<Device | undefined>(undefined);
  const [showCreateForm, setShowCreateForm] = useState(false);

  function handleSearch() {
    void searchDevices(session.token, query).then((outcome) => {
      if (outcome.kind === 'success') {
        setDevices(outcome.data);
      }
    });
  }

  if (selected !== undefined) {
    return (
      <DeviceEditForm
        session={session}
        device={selected}
        onBack={() => {
          setSelected(undefined);
        }}
      />
    );
  }

  if (showCreateForm) {
    return (
      <DeviceCreateForm
        session={session}
        onBack={() => {
          setShowCreateForm(false);
        }}
      />
    );
  }

  return (
    <section className={styles.section}>
      <div className={styles.buttonRow}>
        <input
          className={styles.input}
          placeholder={adminTexts.deviceSearchPlaceholder}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
          }}
        />
        <button type="button" className={styles.primaryButton} onClick={handleSearch}>
          {adminTexts.deviceSearchButton}
        </button>
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={() => {
            setShowCreateForm(true);
          }}
        >
          {adminTexts.deviceCreateTitle}
        </button>
      </div>

      {devices.length === 0 ? (
        <p>{adminTexts.deviceListEmpty}</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>ID</th>
              <th>Название</th>
              <th>eSIM</th>
              <th>Достоверность</th>
            </tr>
          </thead>
          <tbody>
            {devices.map((device) => (
              <tr
                key={device._id}
                className={styles.tableRowClickable}
                onClick={() => {
                  setSelected(device);
                }}
              >
                <td>{device._id}</td>
                <td>{device.displayName}</td>
                <td>{device.esim.support}</td>
                <td>{device.dataConfidence}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

interface DeviceEditFormProps {
  readonly session: AdminSession;
  readonly device: Device;
  readonly onBack: () => void;
}

function DeviceEditForm({ session, device, onBack }: DeviceEditFormProps) {
  const [support, setSupport] = useState<EsimSupport>(device.esim.support);
  const [dataConfidence, setDataConfidence] = useState<DataConfidence>(device.dataConfidence);
  const [deviceType, setDeviceType] = useState<DeviceType>(device.deviceType);
  const [sourceUrl, setSourceUrl] = useState('');
  const [sourceTitle, setSourceTitle] = useState('');
  const [reason, setReason] = useState('');
  const [newAlias, setNewAlias] = useState('');
  const [message, setMessage] = useState<string | undefined>(undefined);

  function handleSave(event: React.FormEvent) {
    event.preventDefault();
    void updateDevice(session.token, device._id, {
      esim: { support },
      dataConfidence,
      deviceType,
      ...(sourceUrl.length > 0
        ? { sources: [{ url: sourceUrl, title: sourceTitle.length > 0 ? sourceTitle : sourceUrl }] }
        : {}),
      decidedBy: session.decidedBy,
      reason,
    }).then((outcome) => {
      setMessage(outcome.kind === 'success' ? adminTexts.resolveSuccess : adminTexts.resolveError);
    });
  }

  function handleAddAlias() {
    void addAlias(session.token, {
      deviceId: device._id,
      alias: newAlias,
      decidedBy: session.decidedBy,
    }).then((outcome) => {
      setMessage(outcome.kind === 'success' ? adminTexts.resolveSuccess : adminTexts.resolveError);
      setNewAlias('');
    });
  }

  return (
    <section className={styles.section}>
      <button type="button" className={styles.secondaryButton} onClick={onBack}>
        {adminTexts.taskDetailBack}
      </button>
      <h2>
        {adminTexts.deviceEditTitle}: {device.displayName} ({device._id})
      </h2>
      <form className={styles.formGrid} onSubmit={handleSave}>
        <label className={styles.fieldLabel}>
          {adminTexts.deviceEditStatusLabel}
          <select
            className={styles.input}
            value={support}
            onChange={(event) => {
              setSupport(findInList(ESIM_SUPPORT_OPTIONS, event.target.value) ?? support);
            }}
          >
            {ESIM_SUPPORT_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.fieldLabel}>
          {adminTexts.deviceEditDataConfidenceLabel}
          <select
            className={styles.input}
            value={dataConfidence}
            onChange={(event) => {
              setDataConfidence(
                findInList(DATA_CONFIDENCE_OPTIONS, event.target.value) ?? dataConfidence,
              );
            }}
          >
            {DATA_CONFIDENCE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.fieldLabel}>
          {adminTexts.deviceEditDeviceTypeLabel}
          <select
            className={styles.input}
            value={deviceType}
            onChange={(event) => {
              setDeviceType(findInList(DEVICE_TYPE_OPTIONS, event.target.value) ?? deviceType);
            }}
          >
            {DEVICE_TYPE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.fieldLabel}>
          {adminTexts.deviceEditSourceUrlLabel}
          <input
            className={styles.input}
            value={sourceUrl}
            onChange={(event) => {
              setSourceUrl(event.target.value);
            }}
          />
        </label>
        <label className={styles.fieldLabel}>
          {adminTexts.deviceEditSourceTitleLabel}
          <input
            className={styles.input}
            value={sourceTitle}
            onChange={(event) => {
              setSourceTitle(event.target.value);
            }}
          />
        </label>
        <label className={styles.fieldLabel}>
          {adminTexts.taskDetailReasonLabel}
          {/*
            `required` — не косметика: пустое обоснование сервер отклоняет (docs/09-decisions.md
            ADR-044), и модератор должен узнать об этом до отправки формы, а не из сообщения об
            ошибке.
          */}
          <input
            className={styles.input}
            required
            value={reason}
            onChange={(event) => {
              setReason(event.target.value);
            }}
          />
        </label>
        <div className={styles.buttonRow}>
          <button type="submit" className={styles.primaryButton}>
            {adminTexts.deviceEditSaveButton}
          </button>
        </div>
      </form>

      <div className={styles.buttonRow}>
        <label className={styles.fieldLabel}>
          {adminTexts.deviceEditAddAliasLabel}
          <input
            className={styles.input}
            value={newAlias}
            onChange={(event) => {
              setNewAlias(event.target.value);
            }}
          />
        </label>
        <button type="button" className={styles.secondaryButton} onClick={handleAddAlias}>
          {adminTexts.deviceEditAddAliasButton}
        </button>
      </div>

      {message !== undefined ? <p className={styles.successMessage}>{message}</p> : null}
    </section>
  );
}

interface DeviceCreateFormProps {
  readonly session: AdminSession;
  readonly onBack: () => void;
}

function DeviceCreateForm({ session, onBack }: DeviceCreateFormProps) {
  const [id, setId] = useState('');
  const [brand, setBrand] = useState('');
  const [brandTitle, setBrandTitle] = useState('');
  const [marketingName, setMarketingName] = useState('');
  const [family, setFamily] = useState('');
  const [modelCodes, setModelCodes] = useState('');
  const [platform, setPlatform] = useState<'ios' | 'android' | 'harmonyos' | 'other'>('android');
  const [deviceType, setDeviceType] = useState<DeviceType>('phone');
  const [esimSupport, setEsimSupport] = useState<EsimSupport>('supported');
  const [releaseYear, setReleaseYear] = useState(new Date().getFullYear());
  const [sourceUrl, setSourceUrl] = useState('');
  const [sourceTitle, setSourceTitle] = useState('');
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState<string | undefined>(undefined);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    void createDevice(session.token, {
      id,
      brand,
      brandTitle,
      marketingName,
      family,
      modelCodes: modelCodes
        .split(',')
        .map((code) => code.trim())
        .filter((code) => code.length > 0),
      platform,
      deviceType,
      esimSupport,
      releaseYear,
      ...(sourceUrl.length > 0
        ? { sources: [{ url: sourceUrl, title: sourceTitle || sourceUrl }] }
        : {}),
      decidedBy: session.decidedBy,
      reason,
    }).then((outcome) => {
      setMessage(outcome.kind === 'success' ? adminTexts.resolveSuccess : adminTexts.resolveError);
    });
  }

  return (
    <section className={styles.section}>
      <button type="button" className={styles.secondaryButton} onClick={onBack}>
        {adminTexts.taskDetailBack}
      </button>
      <h2>{adminTexts.deviceCreateTitle}</h2>
      <form className={styles.formGrid} onSubmit={handleSubmit}>
        <label className={styles.fieldLabel}>
          ID (например xiaomi-poco-x7-pro)
          <input
            className={styles.input}
            value={id}
            onChange={(event) => {
              setId(event.target.value);
            }}
          />
        </label>
        <label className={styles.fieldLabel}>
          Бренд (нормализованный)
          <input
            className={styles.input}
            value={brand}
            onChange={(event) => {
              setBrand(event.target.value);
            }}
          />
        </label>
        <label className={styles.fieldLabel}>
          Бренд (отображаемый)
          <input
            className={styles.input}
            value={brandTitle}
            onChange={(event) => {
              setBrandTitle(event.target.value);
            }}
          />
        </label>
        <label className={styles.fieldLabel}>
          Маркетинговое название
          <input
            className={styles.input}
            value={marketingName}
            onChange={(event) => {
              setMarketingName(event.target.value);
            }}
          />
        </label>
        <label className={styles.fieldLabel}>
          Линейка (family)
          <input
            className={styles.input}
            value={family}
            onChange={(event) => {
              setFamily(event.target.value);
            }}
          />
        </label>
        <label className={styles.fieldLabel}>
          Сервисные коды (через запятую)
          <input
            className={styles.input}
            value={modelCodes}
            onChange={(event) => {
              setModelCodes(event.target.value);
            }}
          />
        </label>
        <label className={styles.fieldLabel}>
          Платформа
          <select
            className={styles.input}
            value={platform}
            onChange={(event) => {
              setPlatform(findInList(PLATFORM_OPTIONS, event.target.value) ?? platform);
            }}
          >
            <option value="ios">ios</option>
            <option value="android">android</option>
            <option value="harmonyos">harmonyos</option>
            <option value="other">other</option>
          </select>
        </label>
        <label className={styles.fieldLabel}>
          {adminTexts.deviceEditDeviceTypeLabel}
          <select
            className={styles.input}
            value={deviceType}
            onChange={(event) => {
              setDeviceType(findInList(DEVICE_TYPE_OPTIONS, event.target.value) ?? deviceType);
            }}
          >
            {DEVICE_TYPE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.fieldLabel}>
          {adminTexts.deviceEditStatusLabel}
          <select
            className={styles.input}
            value={esimSupport}
            onChange={(event) => {
              setEsimSupport(findInList(ESIM_SUPPORT_OPTIONS, event.target.value) ?? esimSupport);
            }}
          >
            {ESIM_SUPPORT_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.fieldLabel}>
          Год выпуска
          <input
            className={styles.input}
            type="number"
            value={releaseYear}
            onChange={(event) => {
              setReleaseYear(Number(event.target.value));
            }}
          />
        </label>
        <label className={styles.fieldLabel}>
          {adminTexts.deviceEditSourceUrlLabel}
          <input
            className={styles.input}
            value={sourceUrl}
            onChange={(event) => {
              setSourceUrl(event.target.value);
            }}
          />
        </label>
        <label className={styles.fieldLabel}>
          {adminTexts.deviceEditSourceTitleLabel}
          <input
            className={styles.input}
            value={sourceTitle}
            onChange={(event) => {
              setSourceTitle(event.target.value);
            }}
          />
        </label>
        <label className={styles.fieldLabel}>
          {adminTexts.taskDetailReasonLabel}
          <input
            className={styles.input}
            required
            value={reason}
            onChange={(event) => {
              setReason(event.target.value);
            }}
          />
        </label>
        <div className={styles.buttonRow}>
          <button type="submit" className={styles.primaryButton}>
            {adminTexts.deviceCreateButton}
          </button>
        </div>
      </form>
      {message !== undefined ? <p className={styles.successMessage}>{message}</p> : null}
    </section>
  );
}

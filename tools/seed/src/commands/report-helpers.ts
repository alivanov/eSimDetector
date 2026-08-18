import type { Device } from '@esim-detector/contracts';

import { fileExists, readJson, writeJson, writeText } from '../io/files';
import type { PreviousSnapshotEntry } from '../report/report';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPreviousSnapshotEntry(value: unknown): value is PreviousSnapshotEntry {
  if (!isRecord(value)) {
    return false;
  }
  const { id, esimSupport, dataConfidence } = value;
  return (
    typeof id === 'string' &&
    (esimSupport === 'supported' ||
      esimSupport === 'not_supported' ||
      esimSupport === 'conditional') &&
    (dataConfidence === 'verified' ||
      dataConfidence === 'derived' ||
      dataConfidence === 'unverified' ||
      dataConfidence === 'quarantined')
  );
}

/** Предыдущий снимок каталога (docs/14 §14.6: "сравнение с предыдущим импортом") — необязателен. */
export function readPreviousSnapshot(
  snapshotPath: string,
): readonly PreviousSnapshotEntry[] | undefined {
  if (!fileExists(snapshotPath)) {
    return undefined;
  }
  const raw = readJson(snapshotPath);
  if (!Array.isArray(raw)) {
    return undefined;
  }
  const entries = raw.filter(isPreviousSnapshotEntry);
  return entries.length === raw.length ? entries : undefined;
}

export function writeSnapshot(snapshotPath: string, devices: readonly Device[]): void {
  const snapshot: PreviousSnapshotEntry[] = devices.map((device) => ({
    id: device._id,
    esimSupport: device.esim.support,
    dataConfidence: device.dataConfidence,
  }));
  writeJson(snapshotPath, snapshot);
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function reportFilePaths(
  reportsDir: string,
  now: Date,
): { markdownPath: string; jsonPath: string } {
  const date = formatDate(now);
  return {
    markdownPath: `${reportsDir}/import-${date}.md`,
    jsonPath: `${reportsDir}/import-${date}.json`,
  };
}

export function writeReportFiles(
  reportsDir: string,
  now: Date,
  markdown: string,
  json: unknown,
): void {
  const { markdownPath, jsonPath } = reportFilePaths(reportsDir, now);
  writeText(markdownPath, markdown);
  writeJson(jsonPath, json);
}

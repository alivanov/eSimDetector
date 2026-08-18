import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildSampleDevice } from '@esim-detector/contracts';

import { readJson } from '../io/files';
import {
  readPreviousSnapshot,
  reportFilePaths,
  writeReportFiles,
  writeSnapshot,
} from './report-helpers';

describe('report-helpers', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'seed-report-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('readPreviousSnapshot возвращает undefined, если файла нет', () => {
    expect(readPreviousSnapshot(join(root, 'missing.json'))).toBeUndefined();
  });

  it('writeSnapshot затем readPreviousSnapshot переживают цикл записи-чтения', () => {
    const snapshotPath = join(root, 'snapshot.json');
    const device = buildSampleDevice({ _id: 'a', dataConfidence: 'derived' });
    writeSnapshot(snapshotPath, [device]);

    const snapshot = readPreviousSnapshot(snapshotPath);
    expect(snapshot).toEqual([{ id: 'a', esimSupport: 'supported', dataConfidence: 'derived' }]);
  });

  it('readPreviousSnapshot отклоняет файл неверной формы', () => {
    const snapshotPath = join(root, 'broken.json');
    writeFileSync(snapshotPath, JSON.stringify([{ not: 'valid' }]), 'utf-8');
    expect(readPreviousSnapshot(snapshotPath)).toBeUndefined();
  });

  it('readPreviousSnapshot отклоняет значение, не являющееся массивом', () => {
    const snapshotPath = join(root, 'not-array.json');
    writeFileSync(snapshotPath, JSON.stringify({ not: 'an array' }), 'utf-8');
    expect(readPreviousSnapshot(snapshotPath)).toBeUndefined();
  });

  it('reportFilePaths строит пути по дате в формате YYYY-MM-DD', () => {
    const { markdownPath, jsonPath } = reportFilePaths(
      '/reports',
      new Date('2026-08-18T12:00:00Z'),
    );
    expect(markdownPath).toBe('/reports/import-2026-08-18.md');
    expect(jsonPath).toBe('/reports/import-2026-08-18.json');
  });

  it('writeReportFiles пишет markdown и JSON рядом', () => {
    const now = new Date('2026-08-18T12:00:00Z');
    writeReportFiles(root, now, '# отчёт', { totals: { accepted: 1 } });
    const { markdownPath, jsonPath } = reportFilePaths(root, now);
    expect(readJson(jsonPath)).toEqual({ totals: { accepted: 1 } });
    expect(readFileSync(markdownPath, 'utf-8')).toBe('# отчёт');
  });
});

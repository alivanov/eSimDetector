import type { EsimSupport } from '@esim-detector/contracts';

import appleCuratedJson from '../../../../data/catalog/curated/apple-iphone.json';
import pixelCuratedJson from '../../../../data/catalog/curated/google-pixel.json';
import referenceJson from '../../../../data/fixtures/catalog.reference.json';
import { defaultPipelinePaths, DEFAULT_FAMILY_MIN_RECORDS } from '../defaults';
import { parseCuratedDevices } from './merge';
import { runPipeline } from './pipeline-runner';
import { parseReferenceFile, type ReferenceEsimSupport } from './reference';

/**
 * Проверяет ФАЙЛ данных `data/fixtures/catalog.reference.json` (агент 5.4, решение вопроса 13 —
 * docs/09-decisions.md ADR-013 дополнение) тем же кодом, которым его читает конвейер
 * (`parseReferenceFile`, docs/14-catalog-ingestion.md §14.4 шаг 4) — образец из
 * `curated-apple.spec.ts`/`curated-pixel.spec.ts`: файл — внешние данные (ADR-016).
 *
 * Ключевая проверка этого файла — не только формат, а СОВПАДЕНИЕ `id` с детерминированным `_id`
 * реального справочника: запись эталона с "висящим" id молча не измеряет ничего (`applyReferenceCheck`/
 * `compareToReference` просто не находят пересечения), поэтому тест строит настоящий справочник
 * тем же кодом, что и `pnpm seed`, и требует пересечения на каждом бренде эталона.
 */

const NOW = new Date('2026-08-19T00:00:00.000Z');
const MIN_REFERENCE_ENTRIES = 150;

function toReferenceSupport(value: EsimSupport): ReferenceEsimSupport {
  if (value === 'supported') return 'yes';
  if (value === 'not_supported') return 'no';
  return 'conditional';
}

describe('data/fixtures/catalog.reference.json', () => {
  it('разбирается без ошибок парсером конвейера', () => {
    const result = parseReferenceFile(referenceJson);
    expect(result.ok).toBe(true);
  });

  it('не содержит "повисших" (молча отброшенных) дублей id — размер после разбора равен длине массива', () => {
    expect(Array.isArray(referenceJson)).toBe(true);
    const raw = referenceJson as unknown[];
    const result = parseReferenceFile(referenceJson);
    if (!result.ok) {
      throw new Error(`эталон не прошёл валидацию: ${result.errors.join('; ')}`);
    }
    expect(result.value.size).toBe(raw.length);
  });

  it('достигает целевого объёма не менее 150 моделей (docs/11 §11.2, ADR-013 дополнение)', () => {
    const result = parseReferenceFile(referenceJson);
    if (!result.ok) {
      throw new Error('эталон не прошёл валидацию');
    }
    expect(result.value.size).toBeGreaterThanOrEqual(MIN_REFERENCE_ENTRIES);
  });

  it('использует словарь CSV (yes/no/conditional), а не словарь контракта (supported/not_supported)', () => {
    const result = parseReferenceFile(referenceJson);
    if (!result.ok) {
      throw new Error('эталон не прошёл валидацию');
    }
    const allowed = new Set(['yes', 'no', 'conditional']);
    for (const entry of result.value.values()) {
      expect(allowed.has(entry.esimSupport)).toBe(true);
    }
  });

  it('каждая запись несёт непустую ссылку на подтверждающий источник в note (ADR-026)', () => {
    const result = parseReferenceFile(referenceJson);
    if (!result.ok) {
      throw new Error('эталон не прошёл валидацию');
    }
    for (const entry of result.value.values()) {
      expect(entry.note).toBeDefined();
      expect((entry.note ?? '').startsWith('https://')).toBe(true);
    }
  });

  it('id записей Apple/Google совпадает с детерминированным _id курируемого ядра, а esimSupport согласован', () => {
    const result = parseReferenceFile(referenceJson);
    if (!result.ok) {
      throw new Error('эталон не прошёл валидацию');
    }

    const { devices: appleDevices, errors: appleErrors } = parseCuratedDevices(
      new Map<string, unknown>([['apple-iphone.json', appleCuratedJson]]),
    );
    expect(appleErrors).toEqual([]);
    const { devices: pixelDevices, errors: pixelErrors } = parseCuratedDevices(
      new Map<string, unknown>([['google-pixel.json', pixelCuratedJson]]),
    );
    expect(pixelErrors).toEqual([]);
    const curatedById = new Map([...appleDevices, ...pixelDevices]);

    const curatedReferenceEntries = [...result.value.values()].filter(
      (entry) => entry.id.startsWith('apple-') || entry.id.startsWith('google-'),
    );
    // Апелляционная выборка обязана покрывать оба курируемых ядра, а не только одно из них.
    expect(curatedReferenceEntries.some((entry) => entry.id.startsWith('apple-'))).toBe(true);
    expect(curatedReferenceEntries.some((entry) => entry.id.startsWith('google-'))).toBe(true);

    for (const entry of curatedReferenceEntries) {
      const device = curatedById.get(entry.id);
      expect(device).toBeDefined();
      if (device === undefined) {
        continue;
      }
      expect(toReferenceSupport(device.esim.support)).toBe(entry.esimSupport);
    }
  });

  it('граница Samsung из §А.8.1 вывод 4 (S10, S10+, S10e, S20 FE) присутствует и разрешена по вендорской странице', () => {
    const result = parseReferenceFile(referenceJson);
    if (!result.ok) {
      throw new Error('эталон не прошёл валидацию');
    }
    // "Galaxy S10+" и "Galaxy S10" схлопываются в один _id конвейером (символ "+" не входит в
    // набор значимых символов text-normalizer/stripPunctuation) — это существующее свойство
    // buildDeviceId (packages/text-normalizer), а не пробел этого агента; отдельной записи для
    // "S10+" в эталоне поэтому нет и не может быть без дублирования id.
    for (const id of ['samsung-galaxy-s10', 'samsung-galaxy-s10e', 'samsung-galaxy-s20-fe']) {
      const entry = result.value.get(id);
      expect(entry).toBeDefined();
      expect(entry?.esimSupport).toBe('no');
    }
  });

  it('пересекается с реально загружаемым справочником Samsung на СВЕЖЕМ прогоне без самого эталона', () => {
    // referencePath указывает на несуществующий файл: пересечение измеряется на прогоне БЕЗ
    // фильтрации самим эталоном (docs/14 §14.4 P3→P4) — иначе тест проверял бы эталон против
    // уже отфильтрованного им самим результата, то есть был бы тавтологией.
    const baseline = runPipeline({
      paths: {
        ...defaultPipelinePaths(),
        referencePath: '/dev/null/esim-detector-no-such-reference.json',
      },
      now: NOW,
      familyMinRecords: DEFAULT_FAMILY_MIN_RECORDS,
    });
    const baselineSamsungIds = new Set(
      baseline.devices.filter((device) => device.brand === 'samsung').map((device) => device._id),
    );

    const result = parseReferenceFile(referenceJson);
    if (!result.ok) {
      throw new Error('эталон не прошёл валидацию');
    }
    const samsungReferenceIds = [...result.value.keys()].filter((id) => id.startsWith('samsung-'));
    expect(samsungReferenceIds.length).toBeGreaterThan(0);

    const intersecting = samsungReferenceIds.filter((id) => baselineSamsungIds.has(id));
    // Не 100% (часть эталона — заведомо опережающие данные для линеек Z Fold/Flip/Note, которых
    // в текущих CSV-выгрузках нет вовсе, §А.8.3 — они станут измеримыми после агента 5.5), но
    // подавляющее большинство обязано пересекаться с уже загружаемыми данными S/A/M-серий.
    expect(intersecting.length / samsungReferenceIds.length).toBeGreaterThan(0.5);
  });
});

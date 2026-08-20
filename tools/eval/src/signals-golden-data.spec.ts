import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parseSignalsGolden, SIGNALS_GOLDEN_CATEGORIES } from './signals-golden';

/**
 * Проверяет ФАЙЛ данных `data/fixtures/signals.golden.json` (docs/08-testing-and-quality.md §8.4)
 * тем же кодом, которым его читал бы стенд оценки качества (`parseSignalsGolden`) — по образцу
 * `tools/seed/src/pipeline/reference-data.spec.ts` (`catalog.reference.json`).
 *
 * Ключевое отличие от того образца: на момент реализации агента 5.7 файл НЕ СУЩЕСТВУЕТ — его
 * наполнение не входит в объём этого агента (единственный практический канал сбора сигналов
 * реальных устройств — виджет и стенд отладки, объём агента 6, docs/09-decisions.md). Поэтому
 * файл не импортируется статически (`import signalsGoldenJson from '...'` немедленно сломал бы
 * сборку отсутствием модуля) — путь читается динамически через `node:fs`, а тест ЯВНО сообщает
 * об отсутствии файла отдельной проверкой, а не пропускает секцию молча: пустой `describe` без
 * единого `it` в выводе Jest неотличим от "тесты ещё не написаны", а не от "файл не наполнен" —
 * тот же принцип, что `tools/seed` уже применяет к отсутствующему `catalog.reference.json`
 * (`referenceFileMissing`, печатается в отчёте явной строкой, а не тихо считается покрытием 100%).
 */

const SIGNALS_GOLDEN_PATH = join(__dirname, '../../../data/fixtures/signals.golden.json');
const MIN_SIGNALS_GOLDEN_ENTRIES = 120;

describe('data/fixtures/signals.golden.json', () => {
  const fileIsPresent = existsSync(SIGNALS_GOLDEN_PATH);

  it('явно сообщает о наличии либо отсутствии файла — отсутствие не считается пройденной проверкой', () => {
    if (!fileIsPresent) {
      console.warn(
        '\n[signals.golden.json] Файл ОТСУТСТВУЕТ: data/fixtures/signals.golden.json не найден. ' +
          'Схема записи описана и проверяется парсером `tools/eval/src/signals-golden.ts` ' +
          '(docs/08-testing-and-quality.md §8.4), но само наполнение файла НЕ входит в объём этапа ' +
          'данных (agent 5.7) — единственный практический канал сбора сигналов реальных устройств ' +
          'это виджет и стенд отладки (объём agent 6). Эталонная выборка сигналов НЕ ПРОВЕРЕНА, а ' +
          'не "пройдена по умолчанию".\n',
      );
    }
    // Утверждение фиксирует именно ТЕКУЩЕЕ состояние явно, а не пропускает проверку тихо: при
    // появлении файла эта же строка перестанет совпадать с `false`, и придётся обновить тест —
    // сигнал того, что содержательные проверки ниже включились и требуют внимания.
    expect(fileIsPresent).toBe(false);
  });

  if (!fileIsPresent) {
    return;
  }

  const rawValue: unknown = JSON.parse(readFileSync(SIGNALS_GOLDEN_PATH, 'utf-8'));
  const { entries, errors } = parseSignalsGolden(rawValue);

  it('целиком соответствует ожидаемой форме записи (signals-golden.ts)', () => {
    if (errors.length > 0) {
      throw new Error(
        `data/fixtures/signals.golden.json не прошёл валидацию:\n${errors.join('\n')}`,
      );
    }
    expect(errors).toEqual([]);
    expect(Array.isArray(rawValue) ? rawValue.length : -1).toBe(entries.length);
  });

  it(`содержит не менее ${MIN_SIGNALS_GOLDEN_ENTRIES} записей (docs/08 §8.4)`, () => {
    expect(entries.length).toBeGreaterThanOrEqual(MIN_SIGNALS_GOLDEN_ENTRIES);
  });

  it('содержит все девять обязательных групп из docs/08 §8.4, каждая непуста', () => {
    const counts = new Map<string, number>();
    for (const entry of entries) {
      counts.set(entry.category, (counts.get(entry.category) ?? 0) + 1);
    }
    for (const category of SIGNALS_GOLDEN_CATEGORIES) {
      expect(counts.get(category) ?? 0).toBeGreaterThan(0);
    }
  });

  it('идентификаторы записей уникальны', () => {
    const ids = entries.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('запись с exactModelKnown=true обязана нести непустой deviceId, и наоборот', () => {
    const violations = entries.filter(
      (entry) =>
        (entry.expected.exactModelKnown && entry.expected.deviceId === null) ||
        (!entry.expected.exactModelKnown && entry.expected.deviceId !== null),
    );
    expect(violations).toEqual([]);
  });

  it('группа "ambiguous-signature" не содержит определённого статуса без уточнения', () => {
    const violations = entries.filter(
      (entry) =>
        entry.category === 'ambiguous-signature' &&
        entry.expected.status !== 'clarification_required',
    );
    expect(violations).toEqual([]);
  });
});

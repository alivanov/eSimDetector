import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parseSignalsGolden, SIGNALS_GOLDEN_CATEGORIES } from './signals-golden';

/**
 * Проверяет ФАЙЛ данных `data/fixtures/signals.golden.json` (docs/08-testing-and-quality.md §8.4)
 * тем же кодом, которым его читал бы стенд оценки качества (`parseSignalsGolden`) — по образцу
 * `tools/seed/src/pipeline/reference-data.spec.ts` (`catalog.reference.json`).
 *
 * На момент реализации агента 5.7 файл НЕ СУЩЕСТВОВАЛ — его наполнение не входило в объём того
 * агента (единственные практические каналы сбора сигналов — стенд отладки `/debug` и эмуляция
 * устройств в браузере, объём агента 6, docs/09-decisions.md, ADR-037/ADR-041). Файл заведён
 * агентом 6.6 (docs/09 ADR-042): путь по-прежнему читается динамически через `node:fs`, а не
 * статическим `import`, — это не переоценка риска отсутствия файла, а сохранение единообразия с
 * тем, как файл читал бы стенд `pnpm eval:detection` в будущем (агент 8), не зависящий от того,
 * существовал ли файл на момент компиляции. Первая проверка явно фиксирует ТЕКУЩЕЕ состояние
 * (файл присутствует), а не молчаливо предполагает его: если файл будет случайно удалён или
 * переименован, тест провалится с понятным сообщением, а не пропустит все шесть содержательных
 * проверок пустым `describe` без единого `it` (неотличимым в выводе Jest от «тесты не написаны»).
 */

const SIGNALS_GOLDEN_PATH = join(__dirname, '../../../data/fixtures/signals.golden.json');
const MIN_SIGNALS_GOLDEN_ENTRIES = 120;

describe('data/fixtures/signals.golden.json', () => {
  const fileIsPresent = existsSync(SIGNALS_GOLDEN_PATH);

  it('файл наполнен (агент 6.6) — отсутствие означало бы регресс, а не пропуск проверки', () => {
    if (!fileIsPresent) {
      console.warn(
        '\n[signals.golden.json] Файл ОТСУТСТВУЕТ: data/fixtures/signals.golden.json не найден, хотя ' +
          'должен существовать с этапа агента 6.6 (docs/09-decisions.md ADR-042). Шесть содержательных ' +
          'проверок ниже не будут выполнены — это регресс наполнения, а не ожидаемое состояние.\n',
      );
    }
    expect(fileIsPresent).toBe(true);
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

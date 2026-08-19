import type { Device } from '@esim-detector/contracts';
import { validateCatalogInvariants } from '@esim-detector/contracts';
import { resolveAppleGenerationRule } from '@esim-detector/esim-rules';

import appleCuratedJson from '../../../../data/catalog/curated/apple-iphone.json';
import osVersionCeilingsJson from '../../../../data/catalog/os-version-ceilings.json';
import { extractMajorVersion, parseOsVersionCeilings } from '../domain/os-version-ceiling';
import { parseCuratedDevices } from './merge';
import { rebuildScreenSignatures } from './rebuild-signatures';

/**
 * Проверяет ФАЙЛ данных курируемого ядра Apple (`data/catalog/curated/apple-iphone.json`) тем же
 * кодом, которым его читает конвейер (`parseCuratedDevices`, docs/14-catalog-ingestion.md §14.4
 * шаг 6) — образец взят из `tools/eval/src/data-files.spec.ts`: файл данных является внешним по
 * отношению к коду (ADR-016), поэтому его форма проверяется разбором, а не выводом
 * `resolveJsonModule`.
 *
 * Смысл проверок: курируемое ядро — единственный источник уровня `verified` (ADR-026), и ошибка
 * в нём не отлавливается ни одним фильтром конвейера CSV, потому что через конвейер оно не идёт.
 */

const NOW = new Date('2026-08-19T00:00:00.000Z');

/** Модификаторы линейки `text-normalizer` (docs/04 §4.2), допустимые в записи справочника (docs/05 §5.3). */
const KNOWN_MODIFIERS: ReadonlySet<string> = new Set([
  'pro',
  'max',
  'plus',
  'ultra',
  'mini',
  'fe',
  'lite',
  'air',
  'fold',
  'flip',
  'a',
]);

const EXPECTED_DEVICE_COUNT = 44;

function loadCuratedApple(): readonly Device[] {
  const result = parseCuratedDevices(
    new Map<string, unknown>([['apple-iphone.json', appleCuratedJson]]),
  );
  expect(result.errors).toEqual([]);
  return [...result.devices.values()];
}

describe('data/catalog/curated/apple-iphone.json', () => {
  const devices = loadCuratedApple();

  it('весь модельный ряд разбирается как массив записей одного файла (docs/14 §14.4 шаг 6)', () => {
    expect(devices).toHaveLength(EXPECTED_DEVICE_COUNT);
    expect(devices.map((device) => device._id)).toContain('apple-iphone-6');
    expect(devices.map((device) => device._id)).toContain('apple-iphone-air');
  });

  it('не нарушает ни один инвариант §5.8, включая согласованность сигнатур экранов (п.7)', () => {
    const signatures = rebuildScreenSignatures(devices, NOW);
    const result = validateCatalogInvariants(devices, signatures);

    expect(result.violations).toEqual([]);
    expect(result.valid).toBe(true);
    expect(signatures.length).toBeGreaterThan(0);
  });

  it('каждая запись — платформа ios, телефон, уровень verified с реальным источником (ADR-026)', () => {
    for (const device of devices) {
      expect(device.platform).toBe('ios');
      expect(device.deviceType).toBe('phone');
      expect(device.dataConfidence).toBe('verified');
      expect(device.provenance.source).toBe('curated');
      expect(device.provenance.batchId).toBeNull();
      expect(device.provenance.agreementCount).toBeNull();
      // Сервисные коды Apple в определении устройства не участвуют: пустой массив вместо
      // правдоподобного кода (AGENTS.md, предметное правило 4).
      expect(device.modelCodes).toEqual([]);
      expect(device.sources.length).toBeGreaterThan(0);
      for (const source of device.sources) {
        expect(source.url).toMatch(/^https:\/\/support\.apple\.com\//);
        expect(source.title.length).toBeGreaterThan(0);
        expect(source.checkedAt.getTime()).not.toBeNaN();
      }
    }
  });

  it('соблюдает конвенцию §5.3 о family и modifiers', () => {
    for (const device of devices) {
      expect(device.family === 'iphone' || device.family.startsWith('iphone-')).toBe(true);
      for (const modifier of device.modifiers) {
        expect(KNOWN_MODIFIERS.has(modifier)).toBe(true);
      }
    }
  });

  it('статус eSIM не противоречит детерминированному правилу Apple (переиспользуется, а не переписывается)', () => {
    for (const device of devices) {
      const rule = resolveAppleGenerationRule({
        family: device.family,
        generation: device.generation,
        modifiers: device.modifiers,
      });
      if (rule.support === undefined) {
        continue;
      }
      if (rule.support === 'not_supported') {
        expect(device.esim.support).toBe('not_supported');
        continue;
      }
      // Правило знает только «есть eSIM у модели»; региональное исключение по КНР сужает это до
      // `conditional` (docs/05 §5.4, случай 1) — но никогда до `not_supported`.
      expect(['supported', 'conditional']).toContain(device.esim.support);
    }
  });

  it('региональные различия оформлены как conditional с условием и вопросом, а не отдельной записью', () => {
    const conditionalDevices = devices.filter((device) => device.esim.support === 'conditional');
    expect(conditionalDevices.length).toBeGreaterThan(0);

    for (const device of conditionalDevices) {
      expect(device.esim.conditions.length).toBeGreaterThan(0);
      expect(device.esim.clarifyingQuestion).not.toBeNull();
      for (const condition of device.esim.conditions) {
        expect(condition.scope).toBe('region');
        expect(condition.support).toBe('not_supported');
        expect(condition.note.length).toBeGreaterThan(0);
      }
      expect(device.esim.clarifyingQuestion?.kind).toBe('region');
      // Вариант «не Китай» обязан отличаться от значения условия, иначе уточнение не может
      // разрешиться в общий случай (`resolveEsimConditions`: условие срабатывает по точному
      // совпадению региона).
      const optionValues = device.esim.clarifyingQuestion?.options.map((option) => option.value);
      expect(optionValues).toContain('CN');
      expect(optionValues?.some((value) => value !== 'CN')).toBe(true);
    }
  });

  it('правило по КНР не сплошное: iPhone Air и 17e поддерживают eSIM в Китае (support.apple.com/en-sg/123879)', () => {
    const byId = new Map(devices.map((device) => [device._id, device]));

    expect(byId.get('apple-iphone-air')?.esim.support).toBe('supported');
    expect(byId.get('apple-iphone-air')?.esim.dualSim).toBe('esim-only');
    expect(byId.get('apple-iphone-17e')?.esim.support).toBe('supported');
    // Остальные модели китайского рынка идут с двумя физическими nano-SIM.
    expect(byId.get('apple-iphone-17')?.esim.support).toBe('conditional');
    expect(byId.get('apple-iphone-17-pro')?.esim.support).toBe('conditional');
    // Модели, которых нет в перечне версий с двумя nano-SIM, регионального условия не получают.
    expect(byId.get('apple-iphone-xs')?.esim.support).toBe('supported');
    expect(byId.get('apple-iphone-12-mini')?.esim.support).toBe('supported');
    expect(byId.get('apple-iphone-13-mini')?.esim.support).toBe('supported');
    expect(byId.get('apple-iphone-se-2020')?.esim.support).toBe('supported');
    expect(byId.get('apple-iphone-se-2022')?.esim.support).toBe('supported');
  });

  it('os.maxVersion заполнен и не превышает потолок фактически вышедшей версии iOS', () => {
    const ceilings = parseOsVersionCeilings(osVersionCeilingsJson);
    expect(ceilings.ok).toBe(true);
    const iosCeiling = ceilings.ok ? ceilings.value.ios : 0;

    for (const device of devices) {
      expect(device.os.maxVersion).not.toBeNull();
      expect(device.screenSignatures.length).toBeGreaterThan(0);
      // `os.maxVersion` хранит ТОЧНУЮ вышедшую версию (`"26.6.1"`), а потолок — целую старшую
      // версию платформы (`26`), поэтому сравнивается целая часть: иначе `26.6 > 26` выглядело бы
      // нарушением там, где данные верны. Точность здесь не роскошь: `maxVersion: "26"` исключил
      // бы из кандидатов всех пользователей iOS 26.x (`isVersionWithinRange` сравнивает посегментно).
      const major = extractMajorVersion(device.os.maxVersion ?? '');
      expect(major).toBeDefined();
      expect(Math.trunc(major ?? 0)).toBeLessThanOrEqual(iosCeiling);
    }
  });

  it('сигнатура экрана даёт группу моделей, а совпадение сигнатур у разных моделей — норма (ADR-002)', () => {
    const signatures = rebuildScreenSignatures(devices, NOW);
    const byKey = new Map(signatures.map((record) => [record.signature, record]));

    // Совпадение сигнатуры у XR и 11 — не дефект данных, на этом построена выдача группы.
    expect(byKey.get('414x896@2')?.candidates).toEqual(['apple-iphone-xr', 'apple-iphone-11']);
    // Единый отрицательный статус у группы Plus до появления eSIM — определённый ответ без уточнения.
    expect(byKey.get('414x736@3')?.esimConsensus).toBe('not_supported');
    // Единственный кандидат сигнатуры iPhone Air — здесь модель определяется точно.
    expect(byKey.get('420x912@3')?.candidates).toEqual(['apple-iphone-air']);
    expect(byKey.get('420x912@3')?.esimConsensus).toBe('supported');
  });
});

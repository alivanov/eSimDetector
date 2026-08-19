import type { Device } from '@esim-detector/contracts';
import { validateCatalogInvariants } from '@esim-detector/contracts';

import pixelCuratedJson from '../../../../data/catalog/curated/google-pixel.json';
import { parseCuratedDevices } from './merge';
import { rebuildScreenSignatures } from './rebuild-signatures';

/**
 * Проверяет ФАЙЛ данных курируемого ядра Google Pixel (`data/catalog/curated/google-pixel.json`,
 * агент 5.4, docs/11-implementation-plan.md §11.2а) тем же кодом, которым его читает конвейер
 * (`parseCuratedDevices`, docs/14-catalog-ingestion.md §14.4 шаг 6) — образец взят из
 * `curated-apple.spec.ts`: файл данных — внешние данные (ADR-016), форма проверяется разбором.
 *
 * В отличие от курируемого ядра Apple, платформа здесь `android`, поэтому инвариант §5.8 п.4
 * (сигнатуры экрана и `os.maxVersion` для iOS) на записи Pixel не распространяется — Android
 * определяется по `Sec-CH-UA-Model`, а не по сигнатуре экрана (docs/03-detection-algorithm.md).
 */

const NOW = new Date('2026-08-19T00:00:00.000Z');

const KNOWN_MODIFIERS: ReadonlySet<string> = new Set(['pro', 'xl', 'a', 'fold']);

const EXPECTED_DEVICE_COUNT = 32;

function loadCuratedPixel(): readonly Device[] {
  const result = parseCuratedDevices(
    new Map<string, unknown>([['google-pixel.json', pixelCuratedJson]]),
  );
  expect(result.errors).toEqual([]);
  return [...result.devices.values()];
}

describe('data/catalog/curated/google-pixel.json', () => {
  const devices = loadCuratedPixel();

  it('весь модельный ряд разбирается как массив записей одного файла (docs/14 §14.4 шаг 6)', () => {
    expect(devices).toHaveLength(EXPECTED_DEVICE_COUNT);
    expect(devices.map((device) => device._id)).toContain('google-pixel');
    expect(devices.map((device) => device._id)).toContain('google-pixel-10-pro-fold');
  });

  it('не нарушает ни один инвариант §5.8', () => {
    const signatures = rebuildScreenSignatures(devices, NOW);
    const result = validateCatalogInvariants(devices, signatures);

    expect(result.violations).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('каждая запись — платформа android, телефон, бренд google, уровень verified с реальным источником (ADR-026)', () => {
    for (const device of devices) {
      expect(device.brand).toBe('google');
      expect(device.platform).toBe('android');
      expect(device.deviceType).toBe('phone');
      expect(device.dataConfidence).toBe('verified');
      expect(device.provenance.source).toBe('curated');
      expect(device.provenance.batchId).toBeNull();
      expect(device.provenance.agreementCount).toBeNull();
      // Сервисные коды Pixel в определении устройства не участвуют: Chrome на Pixel отдаёт в
      // Sec-CH-UA-Model маркетинговое название, а не служебный код (docs/14 §14.2), поэтому
      // выдумывать код запрещённым образом незачем (AGENTS.md, предметное правило 4).
      expect(device.modelCodes).toEqual([]);
      expect(device.sources.length).toBeGreaterThan(0);
      for (const source of device.sources) {
        expect(source.url).toMatch(/^https:\/\/support\.google\.com\/pixelphone\//);
        expect(source.title.length).toBeGreaterThan(0);
        expect(source.checkedAt.getTime()).not.toBeNaN();
      }
    }
  });

  it('соблюдает конвенцию §5.3 о family и modifiers', () => {
    for (const device of devices) {
      expect(device.family).toBe('pixel');
      for (const modifier of device.modifiers) {
        expect(KNOWN_MODIFIERS.has(modifier)).toBe(true);
      }
    }
  });

  it('не использует esim.support: "conditional" — схема условий (region/osVersion) не выражает операторские исключения Pixel 2/3/3a', () => {
    // Google документирует узкие исключения по ОПЕРАТОРУ (Google Fi, Verizon) и по СТРАНЕ покупки
    // (Австралия, Тайвань, Япония) для Pixel 2/3/3a (support.google.com/pixelphone/answer/7086887).
    // esim.conditions поддерживает только scope "region"/"osVersion" (docs/05-data-model.md §5.4) —
    // добавление условия по региону покупки здесь создало бы ложный default для большинства
    // пользователей США/Канады (docs/05 §5.4: "контекст известен и не совпадает ни с одним условием
    // — результат supported"), поэтому агент 5.4 сознательно не использует conditional для этих
    // моделей и документирует узкие исключения только в `esim.notes` (см. отчёт агента 5.4).
    for (const device of devices) {
      expect(device.esim.support).not.toBe('conditional');
      expect(device.esim.conditions).toEqual([]);
      expect(device.esim.clarifyingQuestion).toBeNull();
    }
  });

  it('граница появления eSIM в линейке (support.google.com/pixelphone/answer/7086887)', () => {
    const byId = new Map(devices.map((device) => [device._id, device]));

    expect(byId.get('google-pixel')?.esim.support).toBe('not_supported');
    expect(byId.get('google-pixel-xl')?.esim.support).toBe('not_supported');
    expect(byId.get('google-pixel-2')?.esim.support).toBe('not_supported');
    expect(byId.get('google-pixel-2-xl')?.esim.support).toBe('not_supported');
    expect(byId.get('google-pixel-3')?.esim.support).toBe('not_supported');
    expect(byId.get('google-pixel-3-xl')?.esim.support).toBe('not_supported');
    // Pixel 3a — первая модель линейки с eSIM в общем случае.
    expect(byId.get('google-pixel-3a')?.esim.support).toBe('supported');
    expect(byId.get('google-pixel-3a-xl')?.esim.support).toBe('supported');
    // "Pixel 4 and later: All phones work with eSIM" — без исключений с этого поколения.
    expect(byId.get('google-pixel-4')?.esim.support).toBe('supported');
    expect(byId.get('google-pixel-10-pro-fold')?.esim.support).toBe('supported');
  });

  it('Pixel 4a покрывает и вариант Pixel 4a (5G) через alias, а не отдельную запись', () => {
    // "5G" — незначимый атрибут идентификатора (docs/14 §14.4 шаг 2): у Pixel 4a и Pixel 4a (5G)
    // один и тот же детерминированный _id, поэтому вторая запись дала бы DUPLICATE_DEVICE_ID.
    const pixel4a = devices.find((device) => device._id === 'google-pixel-4a');
    expect(pixel4a?.aliases).toEqual(expect.arrayContaining(['pixel 4a 5g', 'pixel 4a (5g)']));
    expect(devices.map((device) => device._id)).not.toContain('google-pixel-4a-5g');
  });

  it('поколения строго упорядочены как числа для точного сравнения (AGENTS.md, предметное правило 2)', () => {
    for (const device of devices) {
      if (device.generation !== null) {
        expect(Number.isInteger(device.generation)).toBe(true);
        expect(device.generation).toBeGreaterThanOrEqual(2);
        expect(device.generation).toBeLessThanOrEqual(10);
      }
    }
  });
});

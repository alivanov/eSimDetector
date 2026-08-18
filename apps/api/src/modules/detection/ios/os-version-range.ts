import type { OsVersionRange } from '@esim-detector/contracts';

/**
 * Сравнение точечных версий ОС, посегментно и численно (не лексикографически: `"9.0" < "15.0"`,
 * хотя лексикографически было бы наоборот). Копия того же алгоритма, что и приватная функция
 * `compareVersionStrings` в `packages/esim-rules/src/conditions.ts` — пакет её не экспортирует
 * (внутренняя деталь `resolveEsimConditions`), а переизобретать `esim-rules` эта задача не
 * предполагает (AGENTS.md, «ЧЕГО НЕ ДЕЛАТЬ»); реализация достаточно мала (10 строк), чтобы
 * дублирование было дешевле новой межпакетной зависимости на приватную деталь.
 */
export function compareVersionStrings(a: string, b: string): number {
  const segmentsA = a.split('.').map((segment) => Number.parseInt(segment, 10));
  const segmentsB = b.split('.').map((segment) => Number.parseInt(segment, 10));
  const length = Math.max(segmentsA.length, segmentsB.length);

  for (let index = 0; index < length; index += 1) {
    const partA = segmentsA[index] ?? 0;
    const partB = segmentsB[index] ?? 0;
    if (partA !== partB) {
      return partA - partB;
    }
  }
  return 0;
}

/**
 * Правило по версии iOS (docs/03-detection-algorithm.md, §3.5, шаг 1): устройство совместимо с
 * версией `version`, если она попадает в диапазон ФАКТИЧЕСКИ вышедших версий ОС устройства
 * (`os.minVersion`/`os.maxVersion`, docs/05 §5.3) — «если устройство работает на iOS 17 или
 * новее, оно физически не может быть моделью, для которой iOS 17 не выходила». Границы —
 * данные справочника, а не константы кода (docs/03 §3.5).
 */
export function isVersionWithinRange(version: string, range: OsVersionRange): boolean {
  if (range.minVersion !== null && compareVersionStrings(version, range.minVersion) < 0) {
    return false;
  }
  if (range.maxVersion !== null && compareVersionStrings(version, range.maxVersion) > 0) {
    return false;
  }
  return true;
}

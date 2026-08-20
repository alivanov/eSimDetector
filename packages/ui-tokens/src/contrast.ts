/**
 * Расчёт контраста пары «текст на фоне» по формуле WCAG 2.x (относительная яркость sRGB),
 * без внешних зависимостей — этим тест docs/13-branding.md §13.4 «контраст не ниже AA» становится
 * проверяемым кодом, а не декларацией в документации.
 */

export interface RgbColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

/**
 * Разбор шестнадцатеричного цвета вида `#rrggbb`. Возвращает `undefined`, а не бросает
 * исключение, на любом другом формате — токены дизайна пишутся людьми, и опечатка в значении
 * не должна ронять сборку токенов, только сам тест контраста, который её проверяет.
 */
export function hexToRgb(hex: string): RgbColor | undefined {
  if (!HEX_COLOR_PATTERN.test(hex)) {
    return undefined;
  }
  const body = hex.slice(1);
  return {
    r: parseInt(body.slice(0, 2), 16),
    g: parseInt(body.slice(2, 4), 16),
    b: parseInt(body.slice(4, 6), 16),
  };
}

function linearizeChannel(channel8bit: number): number {
  const channel = channel8bit / 255;
  return channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
}

/** Относительная яркость по WCAG: L = 0.2126·R + 0.7152·G + 0.0722·B (каналы линеаризованы). */
export function relativeLuminance(color: RgbColor): number {
  return (
    0.2126 * linearizeChannel(color.r) +
    0.7152 * linearizeChannel(color.g) +
    0.0722 * linearizeChannel(color.b)
  );
}

/**
 * Контраст пары цветов: (L_светлый + 0,05) / (L_тёмный + 0,05). Возвращает `undefined`, если
 * хотя бы один цвет не разобрался — вызывающий код (тест токенов) решает, что делать с этим,
 * а не получает молчаливое произвольное число.
 */
export function contrastRatio(foregroundHex: string, backgroundHex: string): number | undefined {
  const foreground = hexToRgb(foregroundHex);
  const background = hexToRgb(backgroundHex);
  if (foreground === undefined || background === undefined) {
    return undefined;
  }
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Порог AA по WCAG: 4.5:1 для обычного текста, 3:1 для крупного (docs/13-branding.md §13.4).
 * `ratio === undefined` (цвет не разобрался) расценивается как непрохождение проверки.
 */
export function meetsAaContrast(ratio: number | undefined, isLargeText = false): boolean {
  if (ratio === undefined) {
    return false;
  }
  return ratio >= (isLargeText ? 3 : 4.5);
}

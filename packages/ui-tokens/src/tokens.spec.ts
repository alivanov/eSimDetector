import { designTokens } from './tokens';
import type { TokenGroup } from './types';

describe('designTokens — полнота шести групп (docs/13-branding.md §13.2)', () => {
  it('содержит ровно шесть групп верхнего уровня', () => {
    expect(Object.keys(designTokens).sort()).toEqual(
      ['colors', 'typography', 'spacing', 'shape', 'states', 'components'].sort(),
    );
  });

  it('цвета: основной, вторичный, фон, поверхность, текст, границы, состояния', () => {
    expect(Object.keys(designTokens.colors).sort()).toEqual(
      ['primary', 'secondary', 'background', 'surface', 'text', 'border', 'state'].sort(),
    );
    expect(Object.keys(designTokens.colors.text).sort()).toEqual(
      ['primary', 'secondary', 'inverse'].sort(),
    );
    expect(Object.keys(designTokens.colors.state).sort()).toEqual(
      ['success', 'warning', 'error', 'info'].sort(),
    );
  });

  it('типографика: гарнитура, шкала кеглей, интерлиньяж, насыщенность, регистр заголовков', () => {
    expect(Object.keys(designTokens.typography).sort()).toEqual(
      ['fontFamily', 'fontSize', 'lineHeight', 'fontWeight', 'heading'].sort(),
    );
    expect(Object.keys(designTokens.typography.fontSize).length).toBeGreaterThanOrEqual(4);
  });

  it('отступы: непустая шкала', () => {
    expect(Object.keys(designTokens.spacing).length).toBeGreaterThanOrEqual(4);
  });

  it('формы: радиусы, толщина границ, тени', () => {
    expect(Object.keys(designTokens.shape).sort()).toEqual(
      ['radius', 'borderWidth', 'shadow'].sort(),
    );
  });

  it('состояния: наведение, нажатие, фокус, недоступность, загрузка', () => {
    expect(Object.keys(designTokens.states).sort()).toEqual(
      ['hover', 'pressed', 'focus', 'disabled', 'loading'].sort(),
    );
  });

  it('компоненты: кнопки, поле ввода, элемент списка, карточка результата, индикатор загрузки', () => {
    expect(Object.keys(designTokens.components).sort()).toEqual(
      ['button', 'input', 'listItem', 'resultCard', 'loadingIndicator'].sort(),
    );
    expect(Object.keys(designTokens.components.button).sort()).toEqual(
      ['primary', 'secondary', 'text'].sort(),
    );
    expect(Object.keys(designTokens.components.resultCard).sort()).toEqual(
      ['supported', 'notSupported', 'clarification'].sort(),
    );
  });

  it('карточка результата «не поддерживает» не использует цвет ошибки (docs/13 §13.2)', () => {
    expect(designTokens.components.resultCard.notSupported.background).not.toBe(
      designTokens.colors.state.error,
    );
    expect(designTokens.components.resultCard.notSupported.border).not.toBe(
      designTokens.colors.state.error,
    );
  });
});

/** Список плоских значений группы — для проверки отсутствия дублей внутри одной шкалы. */
function leafValues(group: TokenGroup): string[] {
  const values: string[] = [];
  for (const value of Object.values(group)) {
    if (typeof value === 'string') {
      values.push(value);
    } else {
      values.push(...leafValues(value));
    }
  }
  return values;
}

describe('designTokens — отсутствие дублей значений внутри одной шкалы', () => {
  // Проверка ограничена группами-«шкалами», где каждый шаг обязан отличаться от других по
  // смыслу самой шкалы (иначе шкала перестаёт быть шкалой) — палитра цветов, отступы, радиусы,
  // толщина границ, кегли, интерлиньяж, насыщенность шрифта. Группы `states`/`components`
  // сюда не входят: там разные роли (например, `outlineWidth` и `outlineOffset`) закономерно
  // могут совпасть по значению без признака ошибки копирования.
  const scales: ReadonlyArray<readonly [string, TokenGroup]> = [
    ['colors', designTokens.colors],
    ['spacing', designTokens.spacing],
    ['shape.radius', designTokens.shape.radius],
    ['shape.borderWidth', designTokens.shape.borderWidth],
    ['typography.fontSize', designTokens.typography.fontSize],
    ['typography.lineHeight', designTokens.typography.lineHeight],
    ['typography.fontWeight', designTokens.typography.fontWeight],
  ];

  it.each(scales)('%s: все значения различны', (_name, group) => {
    const values = leafValues(group);
    expect(new Set(values).size).toBe(values.length);
  });
});

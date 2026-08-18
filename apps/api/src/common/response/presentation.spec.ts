import { buildPresentation } from './presentation';

describe('buildPresentation', () => {
  it('supported + точная модель: приглашает подключить eSIM, вторичное действие — "не моё устройство"', () => {
    const presentation = buildPresentation({
      status: 'supported',
      deviceName: 'Samsung Galaxy S24 Ultra',
      exactModelKnown: true,
    });

    expect(presentation.title).toBe('Ваше устройство поддерживает eSIM');
    expect(presentation.description).toContain('Samsung Galaxy S24 Ultra');
    expect(presentation.primaryAction).toEqual({ label: 'Подключить eSIM', kind: 'continue' });
    expect(presentation.secondaryAction?.kind).toBe('manual_search');
  });

  it('supported + группа (exactModelKnown=false): вторичное действие предлагает уточнить модель', () => {
    const presentation = buildPresentation({
      status: 'supported',
      deviceName: 'iPhone',
      exactModelKnown: false,
    });

    expect(presentation.description).toContain('iPhone');
    expect(presentation.secondaryAction).toEqual({ label: 'Уточнить модель', kind: 'clarify' });
  });

  it('supported без имени устройства использует нейтральный текст', () => {
    const presentation = buildPresentation({ status: 'supported', exactModelKnown: false });
    expect(presentation.description).toBe('Ваше устройство поддерживает eSIM.');
  });

  it('not_supported с известным устройством называет его в описании', () => {
    const presentation = buildPresentation({
      status: 'not_supported',
      deviceName: 'iPhone 8',
      exactModelKnown: true,
    });

    expect(presentation.title).toBe('Ваше устройство не поддерживает eSIM');
    expect(presentation.description).toBe('iPhone 8 не поддерживает технологию eSIM.');
    expect(presentation.primaryAction).toBeUndefined();
  });

  it('not_supported без имени устройства использует нейтральный текст', () => {
    const presentation = buildPresentation({ status: 'not_supported', exactModelKnown: false });
    expect(presentation.description).toBe('Ваше устройство не поддерживает технологию eSIM.');
  });

  it('clarification_required использует переданный текст вопроса, если он есть', () => {
    const presentation = buildPresentation({
      status: 'clarification_required',
      exactModelKnown: false,
      clarificationQuestion: 'Устройство приобретено в Китае?',
    });

    expect(presentation.title).toBe('Нужно уточнить модель устройства');
    expect(presentation.description).toBe('Устройство приобретено в Китае?');
    expect(presentation.primaryAction).toEqual({ label: 'Выбрать модель', kind: 'clarify' });
  });

  it('clarification_required без вопроса использует формулировку по умолчанию', () => {
    const presentation = buildPresentation({
      status: 'clarification_required',
      exactModelKnown: false,
    });
    expect(presentation.description.length).toBeGreaterThan(0);
  });

  it('формулировки не содержат слов-догадок ("возможно"/"вероятно"/"скорее всего")', () => {
    const forbiddenWords = ['возможно', 'вероятно', 'скорее всего'];
    const cases = [
      buildPresentation({ status: 'supported', exactModelKnown: true, deviceName: 'iPhone 15' }),
      buildPresentation({ status: 'supported', exactModelKnown: false, deviceName: 'iPhone' }),
      buildPresentation({ status: 'not_supported', exactModelKnown: true, deviceName: 'iPhone 8' }),
      buildPresentation({ status: 'clarification_required', exactModelKnown: false }),
    ];

    for (const presentation of cases) {
      const text = `${presentation.title} ${presentation.description}`.toLowerCase();
      for (const word of forbiddenWords) {
        expect(text).not.toContain(word);
      }
    }
  });
});

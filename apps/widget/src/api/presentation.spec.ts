import { parsePresentation } from './presentation';

describe('parsePresentation', () => {
  it('разбирает полную форму с обоими действиями', () => {
    expect(
      parsePresentation({
        title: 'Заголовок',
        description: 'Описание',
        primaryAction: { label: 'Подключить eSIM', kind: 'continue' },
        secondaryAction: { label: 'Уточнить модель', kind: 'clarify' },
      }),
    ).toEqual({
      title: 'Заголовок',
      description: 'Описание',
      primaryAction: { label: 'Подключить eSIM', kind: 'continue' },
      secondaryAction: { label: 'Уточнить модель', kind: 'clarify' },
    });
  });

  it('primaryAction отсутствует у not_supported — форма без primaryAction валидна', () => {
    const result = parsePresentation({
      title: 'Заголовок',
      description: 'Описание',
      secondaryAction: { label: 'Это не моё устройство', kind: 'manual_search' },
    });
    expect(result).toBeDefined();
    expect(result?.primaryAction).toBeUndefined();
    expect(result?.secondaryAction).toEqual({
      label: 'Это не моё устройство',
      kind: 'manual_search',
    });
  });

  it('без title/description — undefined', () => {
    expect(parsePresentation({ description: 'd' })).toBeUndefined();
    expect(parsePresentation({ title: 't' })).toBeUndefined();
    expect(parsePresentation('x')).toBeUndefined();
  });

  it('действие с неизвестным kind игнорируется, а не проваливает весь разбор', () => {
    const result = parsePresentation({
      title: 't',
      description: 'd',
      primaryAction: { label: 'x', kind: 'unknown_kind' },
    });
    expect(result).toEqual({ title: 't', description: 'd' });
  });

  it('действие неверной формы (не объект) игнорируется', () => {
    const result = parsePresentation({ title: 't', description: 'd', primaryAction: 'x' });
    expect(result).toEqual({ title: 't', description: 'd' });
  });
});

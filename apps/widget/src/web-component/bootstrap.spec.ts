import { installFetchMock } from '../test-utils/fetch-mock';

import { ESIM_WIDGET_TAG_NAME, EsimDetectorWidgetElement } from './esim-detector-widget-element';
import { mountWidgetFromScriptTag } from './bootstrap';

describe('mountWidgetFromScriptTag', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('создаёт элемент виджета и переносит на него data-api-base/data-theme/data-channel из тега script', () => {
    installFetchMock();
    document.body.innerHTML = '<div id="esim-checker"></div>';
    const script = document.createElement('script');
    script.setAttribute('data-target', '#esim-checker');
    script.setAttribute('data-api-base', 'https://esim-detector.example.ru/api/v1');
    script.setAttribute('data-theme', 'sbermobile');
    script.setAttribute('data-channel', 'landing-esim');

    mountWidgetFromScriptTag(script);

    const target = document.querySelector('#esim-checker');
    const element = target?.querySelector(ESIM_WIDGET_TAG_NAME);
    expect(element).toBeInstanceOf(EsimDetectorWidgetElement);
    expect(element?.getAttribute('data-api-base')).toBe('https://esim-detector.example.ru/api/v1');
    expect(element?.getAttribute('data-theme')).toBe('sbermobile');
    expect(element?.getAttribute('data-channel')).toBe('landing-esim');
  });

  it('ничего не делает, если data-target отсутствует', () => {
    document.body.innerHTML = '<div id="esim-checker"></div>';
    const script = document.createElement('script');

    expect(() => {
      mountWidgetFromScriptTag(script);
    }).not.toThrow();
    expect(document.querySelector(ESIM_WIDGET_TAG_NAME)).toBeNull();
  });

  it('ничего не делает, если контейнер по data-target не найден на странице', () => {
    document.body.innerHTML = '';
    const script = document.createElement('script');
    script.setAttribute('data-target', '#esim-checker');

    expect(() => {
      mountWidgetFromScriptTag(script);
    }).not.toThrow();
    expect(document.querySelector(ESIM_WIDGET_TAG_NAME)).toBeNull();
  });

  it('не переносит на элемент атрибуты, отсутствующие на теге script (data-theme/data-channel опциональны)', () => {
    installFetchMock();
    document.body.innerHTML = '<div id="esim-checker"></div>';
    const script = document.createElement('script');
    script.setAttribute('data-target', '#esim-checker');

    mountWidgetFromScriptTag(script);

    const element = document.querySelector(ESIM_WIDGET_TAG_NAME);
    expect(element?.hasAttribute('data-api-base')).toBe(false);
    expect(element?.hasAttribute('data-theme')).toBe(false);
    expect(element?.hasAttribute('data-channel')).toBe(false);
  });
});

describe('автозапуск bootstrap при загрузке модуля', () => {
  it('импорт модуля регистрирует пользовательский элемент, не бросая исключение', () => {
    // `document.currentScript` в тестовой среде равен `null` (импорт не является исполняемым
    // `<script>`) — ветка `bootstrap()`, которая только регистрирует элемент, выполняется
    // уже при импорте `./bootstrap` выше в этом файле; здесь фиксируется её итог.
    expect(customElements.get(ESIM_WIDGET_TAG_NAME)).toBe(EsimDetectorWidgetElement);
  });
});

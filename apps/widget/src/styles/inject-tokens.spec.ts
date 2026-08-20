import { injectDesignTokensStyle } from './inject-tokens';

describe('injectDesignTokensStyle', () => {
  afterEach(() => {
    document.head.innerHTML = '';
  });

  it('вставляет CSS-переменные в :root для document', () => {
    injectDesignTokensStyle(document);
    const style = document.head.querySelector('#esim-detector-design-tokens');
    expect(style).not.toBeNull();
    expect(style?.textContent).toContain(':root');
    expect(style?.textContent).toContain('--esim-colors-primary');
  });

  it('идемпотентна — повторный вызов не создаёт вторую копию стиля', () => {
    injectDesignTokensStyle(document);
    injectDesignTokensStyle(document);
    expect(document.head.querySelectorAll('#esim-detector-design-tokens')).toHaveLength(1);
  });

  it('для ShadowRoot использует селектор :host', () => {
    const host = document.createElement('div');
    const shadowRoot = host.attachShadow({ mode: 'open' });
    injectDesignTokensStyle(shadowRoot);
    const style = shadowRoot.querySelector('#esim-detector-design-tokens');
    expect(style?.textContent).toContain(':host');
  });
});

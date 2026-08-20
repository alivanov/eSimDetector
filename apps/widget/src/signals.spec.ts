import { collectBrowserSignals } from './signals';

describe('collectBrowserSignals', () => {
  it('собирает сигналы из переданного window-подобного объекта без исключений', async () => {
    const signals = await collectBrowserSignals(window);
    // jsdom не предоставляет navigator.userAgentData/WebGL — важно, что вызов не бросает
    // исключение (.cursor/rules/ui-and-widget.mdc) и возвращает хотя бы userAgent из jsdom.
    expect(signals.userAgent).toBeDefined();
  });

  it('не бросает исключение, даже если navigator почти пуст', async () => {
    const bareWindow = {
      navigator: {},
      screen: {},
      devicePixelRatio: 1,
      document: { createElement: () => ({ getContext: () => null }) },
    };
    await expect(collectBrowserSignals(bareWindow)).resolves.toBeDefined();
  });
});

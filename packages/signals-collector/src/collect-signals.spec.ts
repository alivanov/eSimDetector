import { collectSignals } from './collect-signals';
import type { NavigatorLike, ScreenLike, SignalsSource, WebglProbe } from './signals-source';

function buildFullNavigator(): NavigatorLike {
  return {
    userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 ...',
    userAgentData: {
      platform: 'Android',
      mobile: true,
      brands: [{ brand: 'Google Chrome', version: '143' }],
      getHighEntropyValues: () =>
        Promise.resolve({
          model: 'SM-S928B',
          platformVersion: '14.0.0',
          fullVersionList: [{ brand: 'Google Chrome', version: '143.0.7300.0' }],
          architecture: 'arm',
          bitness: '64',
        }),
    },
    maxTouchPoints: 5,
    hardwareConcurrency: 8,
    deviceMemory: 8,
  };
}

function buildFullScreen(): ScreenLike {
  return {
    width: 384,
    height: 832,
    availWidth: 384,
    availHeight: 800,
    orientation: { type: 'portrait-primary' },
  };
}

function buildWorkingWebglProbe(): WebglProbe {
  return {
    readVendorAndRenderer: () => ({ vendor: 'Qualcomm', renderer: 'Adreno (TM) 750' }),
  };
}

function buildFullSource(): SignalsSource {
  return {
    navigator: buildFullNavigator(),
    screen: buildFullScreen(),
    devicePixelRatio: 3.75,
    createWebglProbe: () => buildWorkingWebglProbe(),
  };
}

function buildEmptySource(): SignalsSource {
  return {
    navigator: {},
    screen: {},
    devicePixelRatio: NaN,
    createWebglProbe: () => null,
  };
}

describe('collectSignals — полный набор сигналов', () => {
  it('собирает ровно форму signals тела POST /detect (docs/06 §6.2)', async () => {
    const result = await collectSignals(buildFullSource());

    expect(result).toEqual({
      userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 ...',
      uaData: {
        platform: 'Android',
        mobile: true,
        brands: [{ brand: 'Google Chrome', version: '143' }],
        model: 'SM-S928B',
        platformVersion: '14.0.0',
        fullVersionList: [{ brand: 'Google Chrome', version: '143.0.7300.0' }],
        architecture: 'arm',
        bitness: '64',
      },
      screen: {
        width: 384,
        height: 832,
        availWidth: 384,
        availHeight: 800,
        dpr: 3.75,
        orientation: 'portrait-primary',
      },
      hardware: {
        maxTouchPoints: 5,
        hardwareConcurrency: 8,
        deviceMemory: 8,
      },
      webgl: {
        vendor: 'Qualcomm',
        renderer: 'Adreno (TM) 750',
      },
    });
  });

  it('округляет геометрию экрана и счётчики до целых (@IsInt на границе DTO)', async () => {
    const source: SignalsSource = {
      navigator: { maxTouchPoints: 5.4, hardwareConcurrency: 7.6, deviceMemory: 0.5 },
      screen: { width: 384.4, height: 832.6, availWidth: 383.5, availHeight: 799.5 },
      devicePixelRatio: 2.625,
      createWebglProbe: () => null,
    };

    const result = await collectSignals(source);

    expect(result.screen).toEqual({
      width: 384,
      height: 833,
      availWidth: 384,
      availHeight: 800,
      dpr: 2.625,
    });
    expect(result.hardware).toEqual({
      maxTouchPoints: 5,
      hardwareConcurrency: 8,
      deviceMemory: 0.5,
    });
    expect(Number.isInteger(result.screen?.width)).toBe(true);
    expect(Number.isInteger(result.hardware?.maxTouchPoints)).toBe(true);
    // deviceMemory и dpr не приводятся к целым — DTO проверяет их @IsNumber, а не @IsInt.
    expect(Number.isInteger(result.hardware?.deviceMemory)).toBe(false);
    expect(Number.isInteger(result.screen?.dpr)).toBe(false);
  });
});

describe('collectSignals — пустой набор сигналов', () => {
  it('возвращает пустой объект, если ни один сигнал не доступен', async () => {
    const result = await collectSignals(buildEmptySource());
    expect(result).toEqual({});
  });
});

describe('collectSignals — полное отсутствие userAgentData', () => {
  it('не добавляет uaData вовсе, если userAgentData не поддерживается браузером', async () => {
    const source: SignalsSource = {
      navigator: { userAgent: 'Mozilla/5.0 (X11; Linux) Firefox/128.0' },
      screen: {},
      devicePixelRatio: NaN,
      createWebglProbe: () => null,
    };

    const result = await collectSignals(source);

    expect(result).toEqual({ userAgent: 'Mozilla/5.0 (X11; Linux) Firefox/128.0' });
    expect(result.uaData).toBeUndefined();
  });
});

describe('collectSignals — отклонённое обещание getHighEntropyValues', () => {
  it('сохраняет низкоэнтропийные поля и не бросает исключение', async () => {
    const source: SignalsSource = {
      navigator: {
        userAgentData: {
          platform: 'Android',
          mobile: true,
          getHighEntropyValues: () =>
            Promise.reject(
              new Error('NotAllowedError: getHighEntropyValues отклонён политикой разрешений'),
            ),
        },
      },
      screen: {},
      devicePixelRatio: NaN,
      createWebglProbe: () => null,
    };

    await expect(collectSignals(source)).resolves.toEqual({
      uaData: { platform: 'Android', mobile: true },
    });
  });

  it('не добавляет uaData вовсе, если и низкоэнтропийных полей не было', async () => {
    const source: SignalsSource = {
      navigator: {
        userAgentData: {
          getHighEntropyValues: () => Promise.reject(new Error('отказано')),
        },
      },
      screen: {},
      devicePixelRatio: NaN,
      createWebglProbe: () => null,
    };

    const result = await collectSignals(source);
    expect(result.uaData).toBeUndefined();
  });
});

describe('collectSignals — недоступный WebGL', () => {
  it('createWebglProbe вернул null — сигнал webgl отсутствует', async () => {
    const source: SignalsSource = {
      navigator: {},
      screen: {},
      devicePixelRatio: NaN,
      createWebglProbe: () => null,
    };
    const result = await collectSignals(source);
    expect(result.webgl).toBeUndefined();
  });

  it('расширение WEBGL_debug_renderer_info недоступно — readVendorAndRenderer вернул null', async () => {
    const source: SignalsSource = {
      navigator: {},
      screen: {},
      devicePixelRatio: NaN,
      createWebglProbe: () => ({ readVendorAndRenderer: () => null }),
    };
    const result = await collectSignals(source);
    expect(result.webgl).toBeUndefined();
  });

  it('createWebglProbe бросает исключение — webgl отсутствует, остальные сигналы целы', async () => {
    const source: SignalsSource = {
      navigator: { userAgent: 'UA' },
      screen: {},
      devicePixelRatio: NaN,
      createWebglProbe: () => {
        throw new Error('WebGL заблокирован политикой браузера');
      },
    };
    const result = await collectSignals(source);
    expect(result.webgl).toBeUndefined();
    expect(result.userAgent).toBe('UA');
  });

  it('readVendorAndRenderer бросает исключение — webgl отсутствует', async () => {
    const source: SignalsSource = {
      navigator: {},
      screen: {},
      devicePixelRatio: NaN,
      createWebglProbe: () => ({
        readVendorAndRenderer: () => {
          throw new Error('контекст WebGL потерян');
        },
      }),
    };
    const result = await collectSignals(source);
    expect(result.webgl).toBeUndefined();
  });
});

describe('collectSignals — устойчивость к бросающим геттерам источника', () => {
  it('бросающий доступ к userAgent не мешает остальным сигналам', async () => {
    // Свойство добавляется через defineProperty, а не спред (`{ ...navigator }` вызвал бы
    // геттер немедленно, при построении объекта, а не лениво — тест проверяет именно ленивое
    // обращение внутри collectSignals).
    const navigator: NavigatorLike = { hardwareConcurrency: 4 };
    Object.defineProperty(navigator, 'userAgent', {
      enumerable: true,
      get(): string {
        throw new Error('доступ запрещён политикой страницы');
      },
    });

    const source: SignalsSource = {
      navigator,
      screen: {},
      devicePixelRatio: NaN,
      createWebglProbe: () => null,
    };
    const result = await collectSignals(source);
    expect(result.userAgent).toBeUndefined();
    expect(result.hardware).toEqual({ hardwareConcurrency: 4 });
  });

  it('бросающий доступ к userAgentData даёт отсутствие uaData, не исключение', async () => {
    const navigator: NavigatorLike = {};
    Object.defineProperty(navigator, 'userAgentData', {
      enumerable: true,
      get() {
        throw new Error('userAgentData недоступен в этом контексте');
      },
    });

    const source: SignalsSource = {
      navigator,
      screen: {},
      devicePixelRatio: NaN,
      createWebglProbe: () => null,
    };
    const result = await collectSignals(source);
    expect(result.uaData).toBeUndefined();
  });

  it('бросающее чтение низкоэнтропийных полей не мешает высокоэнтропийным', async () => {
    const uaData = {
      getHighEntropyValues: () => Promise.resolve({ model: 'Pixel 8 Pro' }),
    };
    Object.defineProperty(uaData, 'platform', {
      enumerable: true,
      get() {
        throw new Error('platform недоступен');
      },
    });

    const source: SignalsSource = {
      navigator: { userAgentData: uaData },
      screen: {},
      devicePixelRatio: NaN,
      createWebglProbe: () => null,
    };
    const result = await collectSignals(source);
    expect(result.uaData).toEqual({ model: 'Pixel 8 Pro' });
  });

  it('бросающий доступ к геометрии экрана роняет только группу screen', async () => {
    const screen: ScreenLike = {};
    Object.defineProperty(screen, 'width', {
      enumerable: true,
      get() {
        throw new Error('screen недоступен');
      },
    });

    const source: SignalsSource = {
      navigator: { userAgent: 'UA' },
      screen,
      devicePixelRatio: NaN,
      createWebglProbe: () => null,
    };
    const result = await collectSignals(source);
    expect(result.screen).toBeUndefined();
    expect(result.userAgent).toBe('UA');
  });

  it('бросающий доступ к hardwareConcurrency роняет только группу hardware', async () => {
    const navigator: NavigatorLike = { userAgent: 'UA' };
    Object.defineProperty(navigator, 'hardwareConcurrency', {
      enumerable: true,
      get() {
        throw new Error('hardwareConcurrency недоступен');
      },
    });

    const source: SignalsSource = {
      navigator,
      screen: {},
      devicePixelRatio: NaN,
      createWebglProbe: () => null,
    };
    const result = await collectSignals(source);
    expect(result.hardware).toBeUndefined();
    expect(result.userAgent).toBe('UA');
  });
});

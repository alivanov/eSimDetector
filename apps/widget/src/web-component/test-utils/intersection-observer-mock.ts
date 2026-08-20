/**
 * Дублёр `IntersectionObserver` для тестов (jsdom не реализует этот API вовсе — проверено:
 * `'IntersectionObserver' in window` ложно, поэтому без установки дублёра код всегда идёт по
 * ветке деградации `esim-detector-widget-element.tsx`). Вызывает переданный обработчик СРАЗУ при
 * `observe()` с `isIntersecting: true` — виджет в тестах всегда «появляется в области видимости»
 * немедленно, реальная задержка появления не входит в объём модульных тестов.
 *
 * `Object.defineProperty(globalThis, 'IntersectionObserver', ...)` — тот же приём, что
 * `../../test-utils/fetch-mock.ts` использует для `fetch`: `PropertyDescriptor['value']`
 * типизирован как `any` объявлением `lib.dom`, поэтому подмена не требует утверждения типа `as`
 * (ADR-016) и не обязывает дублёр буквально реализовывать весь интерфейс `IntersectionObserver`.
 */
type MockCallback = (entries: readonly { isIntersecting: boolean }[]) => void;

export class ImmediateIntersectionObserverMock {
  private readonly callback: MockCallback;
  public observedTargets: Element[] = [];
  public disconnected = false;

  public constructor(callback: MockCallback) {
    this.callback = callback;
  }

  public observe(target: Element): void {
    this.observedTargets.push(target);
    this.callback([{ isIntersecting: true }]);
  }

  public unobserve(): void {
    // Не требуется дублёру: код продукта вызывает только `disconnect()`.
  }

  public disconnect(): void {
    this.disconnected = true;
  }

  public takeRecords(): readonly { isIntersecting: boolean }[] {
    return [];
  }
}

export function installImmediateIntersectionObserverMock(): void {
  Object.defineProperty(globalThis, 'IntersectionObserver', {
    value: ImmediateIntersectionObserverMock,
    writable: true,
    configurable: true,
  });
}

export function removeIntersectionObserverMock(): void {
  Object.defineProperty(globalThis, 'IntersectionObserver', {
    value: undefined,
    writable: true,
    configurable: true,
  });
}

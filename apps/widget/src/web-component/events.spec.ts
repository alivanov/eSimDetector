import { dispatchWidgetEvent, ESIM_WIDGET_EVENT_TYPES } from './events';

describe('dispatchWidgetEvent', () => {
  it('публикует CustomEvent с bubbles и composed равными true', () => {
    const target = document.createElement('div');
    let received: Event | undefined;
    target.addEventListener('esim:result', (event) => {
      received = event;
    });

    dispatchWidgetEvent(target, 'esim:result', {
      status: 'supported',
      deviceId: 'apple-iphone-15',
      confidence: 0.9,
      exactModelKnown: true,
    });

    expect(received).toBeInstanceOf(CustomEvent);
    expect(received?.bubbles).toBe(true);
    expect(received?.composed).toBe(true);
  });

  it('передаёт detail без изменений', () => {
    const target = document.createElement('div');
    let detail: unknown;
    target.addEventListener('esim:error', (event) => {
      if (event instanceof CustomEvent) {
        detail = event.detail;
      }
    });

    dispatchWidgetEvent(target, 'esim:error', { code: 'NETWORK', message: 'нет связи' });

    expect(detail).toEqual({ code: 'NETWORK', message: 'нет связи' });
  });

  it('событие пересекает границу теневого DOM благодаря composed', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const shadowRoot = host.attachShadow({ mode: 'open' });
    const innerNode = document.createElement('span');
    shadowRoot.appendChild(innerNode);

    let receivedOnHost = false;
    host.addEventListener('esim:ready', () => {
      receivedOnHost = true;
    });

    dispatchWidgetEvent(innerNode, 'esim:ready', { channel: null });

    expect(receivedOnHost).toBe(true);
    host.remove();
  });

  it('без composed событие не пересекло бы границу теневого DOM (обоснование требования)', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const shadowRoot = host.attachShadow({ mode: 'open' });
    const innerNode = document.createElement('span');
    shadowRoot.appendChild(innerNode);

    let receivedOnHost = false;
    host.addEventListener('esim:ready', () => {
      receivedOnHost = true;
    });

    innerNode.dispatchEvent(new CustomEvent('esim:ready', { bubbles: true, composed: false }));

    expect(receivedOnHost).toBe(false);
    host.remove();
  });

  it('перечень типов событий содержит ровно шесть значений из docs/07 §7.2', () => {
    expect(ESIM_WIDGET_EVENT_TYPES).toEqual([
      'esim:ready',
      'esim:detected',
      'esim:clarification',
      'esim:result',
      'esim:error',
      'esim:action',
    ]);
  });
});

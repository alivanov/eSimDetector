import type { CallHandler, ExecutionContext } from '@nestjs/common';
import type { Response } from 'express';
import { of } from 'rxjs';

import { ClientHintsInterceptor } from './client-hints.interceptor';

function buildContext(response: Pick<Response, 'setHeader'>): ExecutionContext {
  const fake = {
    switchToHttp: () => ({ getResponse: () => response }),
  };
  return fake as ExecutionContext;
}

describe('ClientHintsInterceptor', () => {
  it('выставляет Accept-CH и Critical-CH на ответе (docs/03 §3.2, docs/07 §7.5)', () => {
    const setHeader = jest.fn();
    const interceptor = new ClientHintsInterceptor();
    const handler: Pick<CallHandler, 'handle'> = { handle: () => of('ok') };

    interceptor.intercept(buildContext({ setHeader }), handler as CallHandler).subscribe();

    expect(setHeader).toHaveBeenCalledWith('Accept-CH', expect.stringContaining('Sec-CH-UA-Model'));
    expect(setHeader).toHaveBeenCalledWith('Critical-CH', 'Sec-CH-UA-Model');
  });
});

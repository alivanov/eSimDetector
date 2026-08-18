import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import type { Response } from 'express';
import type { Observable } from 'rxjs';

/**
 * Выставляет `Accept-CH`/`Critical-CH` на каждом ответе (.cursor/rules/api-boundaries.mdc:
 * «Интерсептор выставляет Accept-CH и Critical-CH»; docs/03-detection-algorithm.md, §3.2;
 * docs/07-integration.md, §7.5: «Наш собственный сервер выставляет Accept-CH и Critical-CH
 * самостоятельно — для сценария, когда пользователь открывает демонстрационную страницу
 * напрямую»). Основной канал получения модели Android — JavaScript-вызов
 * `getHighEntropyValues()` (работает независимо от заголовков), эти заголовки — резервный
 * путь для интеграции через HTTP-заголовки на стороне сервера заказчика (docs/07 §7.5,
 * третья строка таблицы) и для прямого захода на наш собственный домен.
 */
const ACCEPT_CH_HINTS = [
  'Sec-CH-UA-Model',
  'Sec-CH-UA-Platform-Version',
  'Sec-CH-UA-Full-Version-List',
  'Sec-CH-UA-Arch',
  'Sec-CH-UA-Bitness',
].join(', ');

/** `Sec-CH-UA-Model` — единственная подсказка, без которой ветка Android не работает вовсе. */
const CRITICAL_CH_HINTS = 'Sec-CH-UA-Model';

@Injectable()
export class ClientHintsInterceptor implements NestInterceptor {
  public intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const response = context.switchToHttp().getResponse<Response>();
    response.setHeader('Accept-CH', ACCEPT_CH_HINTS);
    response.setHeader('Critical-CH', CRITICAL_CH_HINTS);
    return next.handle();
  }
}

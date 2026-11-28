import {
  ArgumentsHost,
  CallHandler,
  Catch,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import type { Request } from 'express';
import { map, Observable } from 'rxjs';
import { langOf, translateBody, translateMessage } from './translate';

/**
 * Sends error messages in the user's language (header X-Lang or cookie erp_lang).
 * Catches every error, including those thrown by guards (missing permission…),
 * which interceptors never see. Non-HTTP errors go to Nest's default handler.
 */
@Catch()
export class I18nExceptionFilter extends BaseExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const lang = host.getType() === 'http' ? langOf(host.switchToHttp().getRequest<Request>()) : 'en';
    if (lang === 'en' || !(exception instanceof HttpException)) return super.catch(exception, host);

    const body = exception.getResponse();
    const translated =
      typeof body === 'string'
        ? translateMessage(body, lang)
        : {
            ...(body as Record<string, unknown>),
            message: translateAny((body as Record<string, unknown>).message, lang),
            ...('error' in (body as object) ? { error: translateAny((body as Record<string, unknown>).error, lang) } : {}),
          };
    const copy = new HttpException(translated, exception.getStatus(), { cause: exception });
    return super.catch(copy, host);
  }
}

function translateAny(v: unknown, lang: 'en' | 'ar'): unknown {
  if (typeof v === 'string') return translateMessage(v, lang);
  if (Array.isArray(v)) return v.map((x) => translateAny(x, lang));
  return v;
}

/** Translates the row errors of successful responses (import previews and reports). */
@Injectable()
export class I18nResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const lang = langOf(context.switchToHttp().getRequest<Request>());
    if (lang === 'en') return next.handle();
    return next.handle().pipe(map((body) => translateBody(body, lang)));
  }
}

import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { RateLimiter } from './rate-limiter';
import { RATE_LIMIT_KEY, RateLimitOptions } from './rate-limit.decorator';

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly limiter: RateLimiter,
  ) {}

  canActivate(ctx: ExecutionContext): boolean {
    const opts = this.reflector.getAllAndOverride<RateLimitOptions[] | undefined>(RATE_LIMIT_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!opts?.length) return true;
    const http = ctx.switchToHttp();
    const req = http.getRequest<Request>();
    for (const o of opts) {
      const r = this.limiter.hit(`${o.name}:${o.key(req)}`, o.limit, o.windowMs);
      if (!r.allowed) {
        const minutes = Math.max(1, Math.ceil(r.retryAfterMs / 60000));
        http
          .getResponse<Response>()
          .setHeader('Retry-After', String(Math.ceil(r.retryAfterMs / 1000)));
        throw new HttpException(
          {
            statusCode: 429,
            message: `Too many attempts. Try again in ${minutes} minutes.`,
            error: 'Too Many Requests',
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }
    return true;
  }
}

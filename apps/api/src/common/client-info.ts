import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export interface ClientInfo {
  ip?: string;
  userAgent?: string;
}

export function extractClientInfo(req: Request): ClientInfo {
  const ua = req.headers['user-agent'];
  return { ip: req.ip, userAgent: ua ? ua.slice(0, 255) : undefined };
}

/** Injects `{ ip, userAgent }` of the caller. */
export const Client = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ClientInfo =>
    extractClientInfo(ctx.switchToHttp().getRequest<Request>()),
);

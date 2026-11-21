import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { RequestUser } from '../types/request-user';

/** Injects the logged-in user: `me(@CurrentUser() user: RequestUser)` */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestUser => ctx.switchToHttp().getRequest().user,
);

import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { PolicyViolation } from '../core/iam/access-policy';

const CONFLICT = new Set(['LAST_ADMIN', 'PROTECTED_ROLE', 'SYSTEM_ROLE']);

@Catch(PolicyViolation)
export class PolicyViolationFilter implements ExceptionFilter {
  catch(e: PolicyViolation, host: ArgumentsHost) {
    const statusCode = CONFLICT.has(e.code) ? 409 : 403;
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(statusCode)
      .json({ statusCode, message: e.message, code: e.code });
  }
}

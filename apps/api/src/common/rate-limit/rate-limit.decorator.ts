import { SetMetadata } from '@nestjs/common';
import type { Request } from 'express';

export interface RateLimitOptions {
  name: string;
  limit: number;
  windowMs: number;
  key: (req: Request) => string;
}

export const RATE_LIMIT_KEY = 'rateLimit';

/** One or more limits; all must pass. */
export const RateLimit = (...opts: RateLimitOptions[]) => SetMetadata(RATE_LIMIT_KEY, opts);

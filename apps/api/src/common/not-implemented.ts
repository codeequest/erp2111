import { NotImplementedException } from '@nestjs/common';

/**
 * Placeholder used by the skeleton endpoints. Replace each call with the real
 * implementation when you build the feature. Returns HTTP 501.
 */
export function notImplemented(feature: string): never {
  throw new NotImplementedException(`${feature} is not implemented yet`);
}

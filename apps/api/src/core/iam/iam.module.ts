import { Global, Module } from '@nestjs/common';
import { RateLimiter } from '../../common/rate-limit/rate-limiter';
import { SecurityPolicyService } from './security-policy.service';

@Global()
@Module({
  providers: [SecurityPolicyService, RateLimiter],
  exports: [SecurityPolicyService, RateLimiter],
})
export class IamModule {}

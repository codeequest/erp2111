import { ArgumentsHost } from '@nestjs/common';
import { PolicyViolation } from '../core/iam/access-policy';
import { PolicyViolationFilter } from './policy-violation.filter';

function run(code: ConstructorParameters<typeof PolicyViolation>[0]) {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status }) }),
  } as unknown as ArgumentsHost;
  new PolicyViolationFilter().catch(new PolicyViolation(code, 'nope'), host);
  return { status: status.mock.calls[0][0], body: json.mock.calls[0][0] };
}

describe('PolicyViolationFilter', () => {
  it('maps LAST_ADMIN to 409', () => {
    const r = run('LAST_ADMIN');
    expect(r.status).toBe(409);
    expect(r.body).toEqual({ statusCode: 409, message: 'nope', code: 'LAST_ADMIN' });
  });
  it('maps PROTECTED_ROLE and SYSTEM_ROLE to 409', () => {
    expect(run('PROTECTED_ROLE').status).toBe(409);
    expect(run('SYSTEM_ROLE').status).toBe(409);
  });
  it('maps ESCALATION to 403', () => {
    expect(run('ESCALATION').status).toBe(403);
    expect(run('SELF_LOCKOUT').status).toBe(403);
  });
});

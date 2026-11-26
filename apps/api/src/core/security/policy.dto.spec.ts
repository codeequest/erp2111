import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdatePolicyDto } from './dto/policy.dto';

const errorsFor = async (plain: object) =>
  (await validate(plainToInstance(UpdatePolicyDto, plain))).map((e) => e.property);

describe('UpdatePolicyDto', () => {
  it('rejects a minimum length below 8', async () => {
    expect(await errorsFor({ passwordMinLength: 6 })).toContain('passwordMinLength');
  });

  it('rejects a maximum shorter than the minimum', async () => {
    expect(await errorsFor({ passwordMinLength: 40, passwordMaxLength: 32 })).toContain(
      'passwordMaxLength',
    );
  });

  it('enforces the documented ranges', async () => {
    expect(await errorsFor({ lockoutThreshold: 2 })).toContain('lockoutThreshold');
    expect(await errorsFor({ lockoutMinutes: 2000 })).toContain('lockoutMinutes');
    expect(await errorsFor({ invitationTtlHours: 0 })).toContain('invitationTtlHours');
    expect(await errorsFor({ resetTtlMinutes: 5 })).toContain('resetTtlMinutes');
    expect(await errorsFor({ accessReviewDays: 400 })).toContain('accessReviewDays');
    expect(await errorsFor({ dormantDays: 3 })).toContain('dormantDays');
  });

  it('accepts a valid partial update', async () => {
    expect(await errorsFor({ passwordMinLength: 14, requireMfaForPrivileged: false })).toEqual([]);
  });
});

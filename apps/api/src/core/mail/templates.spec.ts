import { render } from './templates';

describe('render', () => {
  it('renders password_reset with escaping, link and expiry', () => {
    const r = render('password_reset', {
      company: 'ACME',
      name: '<b>Jo</b>',
      link: 'https://x/reset-password#token=abc',
      expiresIn: '60 minutes',
    });
    expect(r.subject).toBe('Reset your ACME password');
    expect(r.html).toContain('&lt;b&gt;Jo&lt;/b&gt;');
    expect(r.html).not.toContain('<b>Jo</b>');
    expect(r.html).toContain('https://x/reset-password#token=abc');
    expect(r.text).toContain('60 minutes');
    expect(r.text).toContain('https://x/reset-password#token=abc');
    expect(r.text).toContain("If you didn't expect this email");
  });

  it('has a subject for every template', () => {
    const v = { company: 'ACME', name: 'Jo', link: 'https://x' };
    expect(render('invitation', v).subject).toBe("You're invited to ACME");
    expect(render('password_changed', v).subject).toBe('Your ACME password was changed');
    expect(render('email_verification', v).subject).toBe('Confirm your email for ACME');
    expect(render('mfa_reset', v).subject).toBe(
      'Two-factor authentication was reset on your ACME account',
    );
    expect(render('account_deactivated', v).subject).toBe('Your ACME account was deactivated');
  });

  it('uses the contact-administrator footer for password_changed and mfa_reset', () => {
    const v = { company: 'ACME', name: 'Jo' };
    expect(render('password_changed', v).text).toContain(
      "If this wasn't you, contact your administrator immediately.",
    );
    expect(render('mfa_reset', v).text).toContain('contact your administrator immediately');
  });

  it('escapes a quote in the link so the href cannot be broken out of', () => {
    const r = render('invitation', { company: 'ACME', name: 'Jo', link: 'https://x/"onmouseover="a' });
    expect(r.html).toContain('https://x/&quot;onmouseover=&quot;a');
    expect(r.html).not.toContain('href="https://x/"onmouseover');
  });
});

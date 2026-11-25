export type MailTemplate =
  | 'invitation'
  | 'password_reset'
  | 'password_changed'
  | 'email_verification'
  | 'mfa_reset'
  | 'account_deactivated';

export interface MailVars {
  company: string;
  name: string;
  link?: string;
  expiresIn?: string;
}

export interface RenderedMail {
  subject: string;
  html: string;
  text: string;
}

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

const IGNORE = "If you didn't expect this email, you can ignore it.";
const CONTACT = "If this wasn't you, contact your administrator immediately.";

interface Def {
  subject: (company: string) => string;
  lines: (company: string) => string[];
  action?: string;
  footer: string;
}

const DEFS: Record<MailTemplate, Def> = {
  invitation: {
    subject: (c) => `You're invited to ${c}`,
    lines: (c) => [`You've been invited to join ${c}. Set your password to activate your account.`],
    action: 'Accept invitation',
    footer: IGNORE,
  },
  password_reset: {
    subject: (c) => `Reset your ${c} password`,
    lines: (c) => [`We received a request to reset your ${c} password.`],
    action: 'Reset password',
    footer: IGNORE,
  },
  password_changed: {
    subject: (c) => `Your ${c} password was changed`,
    lines: (c) => [`The password for your ${c} account was just changed.`],
    footer: CONTACT,
  },
  email_verification: {
    subject: (c) => `Confirm your email for ${c}`,
    lines: (c) => [`Please confirm your email address to finish setting up your ${c} account.`],
    action: 'Confirm email',
    footer: IGNORE,
  },
  mfa_reset: {
    subject: (c) => `Two-factor authentication was reset on your ${c} account`,
    lines: () => [
      'Two-factor authentication was reset on your account. You will be asked to set it up again at your next sign-in.',
    ],
    footer: CONTACT,
  },
  account_deactivated: {
    subject: (c) => `Your ${c} account was deactivated`,
    lines: (c) => [`Your ${c} account was deactivated. You can no longer sign in.`],
    footer: 'If you think this is a mistake, contact your administrator.',
  },
};

/** Pure renderer. All interpolated values are HTML-escaped in `html`. */
export function render(t: MailTemplate, vars: MailVars): RenderedMail {
  const def = DEFS[t];
  const subject = def.subject(vars.company);
  const lines = def.lines(vars.company);
  const expiry = vars.expiresIn ? `This link expires in ${vars.expiresIn}.` : null;

  const text = [
    `Hi ${vars.name},`,
    '',
    ...lines,
    ...(vars.link ? ['', vars.link] : []),
    ...(expiry && vars.link ? ['', expiry] : []),
    '',
    def.footer,
  ].join('\n');

  const p = 'margin:0 0 16px;font-size:15px;line-height:1.5;color:#334155;';
  const link = vars.link ? esc(vars.link) : null;
  const html = [
    '<!doctype html><html><body style="margin:0;padding:24px;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">',
    '<div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;">',
    `<h1 style="margin:0 0 16px;font-size:20px;color:#0f172a;">${esc(subject)}</h1>`,
    `<p style="${p}">Hi ${esc(vars.name)},</p>`,
    ...lines.map((l) => `<p style="${p}">${esc(l)}</p>`),
    ...(link && def.action
      ? [
          `<p style="margin:24px 0;"><a href="${link}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:bold;font-size:15px;">${esc(def.action)}</a></p>`,
          `<p style="${p}font-size:13px;color:#64748b;">Or copy this link into your browser:<br><a href="${link}" style="color:#2563eb;word-break:break-all;">${link}</a></p>`,
        ]
      : []),
    ...(expiry && link ? [`<p style="${p}">${esc(expiry)}</p>`] : []),
    `<p style="${p}font-size:13px;color:#64748b;">${esc(def.footer)}</p>`,
    '</div></body></html>',
  ].join('');

  return { subject, html, text };
}

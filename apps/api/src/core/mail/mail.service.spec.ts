import { MailService } from './mail.service';

function make(env: Record<string, string>, sendMail = jest.fn().mockResolvedValue({})) {
  const prisma = {
    emailOutbox: {
      create: jest.fn().mockResolvedValue({ id: 'e1' }),
      update: jest.fn().mockResolvedValue({}),
    },
    companySettings: { findUnique: jest.fn().mockResolvedValue({ name: 'ACME' }) },
  };
  const config = { get: (k: string, d?: string) => env[k] ?? d };
  const svc = new MailService(prisma as never, config as never);
  (svc as unknown as { transport: unknown }).transport = { sendMail };
  return { svc, prisma, sendMail };
}

const vars = { name: 'Jo', link: 'https://x/accept-invite#token=t', expiresIn: '72 hours' };

describe('MailService', () => {
  it('outbox transport stores the html body and marks SENT without calling smtp', async () => {
    const { svc, prisma, sendMail } = make({ MAIL_TRANSPORT: 'outbox' });
    await svc.send('a@b.c', 'invitation', vars);
    const data = prisma.emailOutbox.create.mock.calls[0][0].data;
    expect(data.body).toContain('https://x/accept-invite#token=t');
    expect(data.subject).toBe("You're invited to ACME");
    expect(sendMail).not.toHaveBeenCalled();
    expect(prisma.emailOutbox.update.mock.calls[0][0].data.status).toBe('SENT');
  });

  it('smtp transport stores body null and sends via transport', async () => {
    const { svc, prisma, sendMail } = make({ MAIL_TRANSPORT: 'smtp', SMTP_HOST: 'h' });
    await svc.send('a@b.c', 'invitation', vars);
    expect(prisma.emailOutbox.create.mock.calls[0][0].data.body).toBeNull();
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(prisma.emailOutbox.update.mock.calls[0][0].data.status).toBe('SENT');
  });

  it('records FAILED and never throws when the transport fails', async () => {
    const { svc, prisma } = make(
      { MAIL_TRANSPORT: 'smtp', SMTP_HOST: 'h' },
      jest.fn().mockRejectedValue(new Error('boom')),
    );
    await expect(svc.send('a@b.c', 'invitation', vars)).resolves.toBeUndefined();
    const data = prisma.emailOutbox.update.mock.calls[0][0].data;
    expect(data.status).toBe('FAILED');
    expect(data.error).toBe('boom');
  });

  it('never throws when the database fails', async () => {
    const { svc, prisma } = make({ MAIL_TRANSPORT: 'outbox' });
    prisma.emailOutbox.create.mockRejectedValue(new Error('db'));
    await expect(svc.send('a@b.c', 'invitation', vars)).resolves.toBeUndefined();
  });
});

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { totpAt } from '../../src/core/iam/totp';

export const ADMIN = { email: 'e2e-admin@erp.test', password: 'E2e-Admin-Strong-Pass-1' };
export const PASSWORD = 'Copper-Lantern-Orbit-93';

export const prisma = new PrismaClient();

/** The real app with the same global setup as main.ts. */
export async function bootApp(): Promise<INestApplication> {
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = mod.createNestApplication();
  app.setGlobalPrefix('api/v1');
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  await app.init();
  return app;
}

export const api = (app: INestApplication) => request(app.getHttpServer());
export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

export interface Session {
  token: string;
  cookie: string;
  userId: string;
}

function sessionFrom(res: request.Response): Session {
  const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
  const cookie = (raw ?? []).find((c) => c.startsWith('erp_refresh=')) ?? '';
  return { token: res.body.accessToken, cookie: cookie.split(';')[0], userId: res.body.user?.id };
}

/** Logs in a user without pending sign-in steps. */
export async function loginAs(
  app: INestApplication,
  email: string,
  password = PASSWORD,
): Promise<Session> {
  const res = await api(app).post('/api/v1/auth/login').send({ email, password });
  if (res.status !== 200 || res.body.kind !== 'session') {
    throw new Error(`login ${email} → ${res.status} ${JSON.stringify(res.body)}`);
  }
  return sessionFrom(res);
}

/** Last link of a template mailed to `email` (dev outbox stores bodies). */
export async function outboxToken(email: string, template: string): Promise<string> {
  const row = await prisma.emailOutbox.findFirst({
    where: { to: email, template },
    orderBy: { createdAt: 'desc' },
  });
  const m = row?.body && /#token=([\w-]+)/.exec(row.body);
  if (!m) throw new Error(`no ${template} email for ${email}`);
  return m[1];
}

let seq = 0;
/** Creates (invites) a user as `adminToken`; returns its id and email. */
export async function createUser(
  app: INestApplication,
  adminToken: string,
  body: Record<string, unknown> = {},
): Promise<{ id: string; email: string }> {
  const email = `user${Date.now()}${++seq}@e2e.test`;
  const res = await api(app)
    .post('/api/v1/users')
    .set(bearer(adminToken))
    .send({ firstName: 'Test', lastName: `User ${seq}`, email, ...body });
  if (res.status !== 201)
    throw new Error(`create user → ${res.status} ${JSON.stringify(res.body)}`);
  return { id: res.body.id, email: res.body.email };
}

/** Accepts the invitation of `email` with PASSWORD; returns the API response. */
export async function acceptInvite(app: INestApplication, email: string) {
  const token = await outboxToken(email, 'invitation');
  return api(app).post('/api/v1/auth/invitation/accept').send({ token, newPassword: PASSWORD });
}

/** Creates a user, accepts the invitation and returns a session. */
export async function activeUser(
  app: INestApplication,
  adminToken: string,
  body: Record<string, unknown> = {},
): Promise<{ id: string; email: string; session: Session }> {
  const u = await createUser(app, adminToken, body);
  const res = await acceptInvite(app, u.email);
  if (res.body.kind !== 'session') throw new Error(`accept → ${JSON.stringify(res.body)}`);
  return { ...u, session: sessionFrom(res) };
}

export async function roleId(name: string): Promise<string> {
  const r = await prisma.role.findFirstOrThrow({ where: { name } });
  return r.id;
}

/** A TOTP code that hasn't been used yet (step offset +1 is accepted by the server). */
export function totpCode(secret: string, offset = 0): string {
  return totpAt(secret, Math.floor(Date.now() / 30_000) + offset);
}

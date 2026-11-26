# ERP — Trading / Retail

Modular-monolith ERP: **Inventory · Purchasing · Sales · Invoicing**, with roles and permissions per module.

| Part | Tech | Folder |
|---|---|---|
| Web UI | Next.js 15 (App Router), React 19, Tailwind CSS 4 | `apps/web` |
| API | NestJS 11, JWT auth, Swagger | `apps/api` |
| Database | PostgreSQL 17 + Prisma 6 | `apps/api/prisma` |
| Shared code | permission codes, default roles, menu | `packages/shared` |

> **Status: v0.1 skeleton.** Login, roles/permissions, the main ERP page and the full database schema work.
> All business endpoints exist and are protected, but answer **501 Not Implemented** until a module is built.

## Quick start

Requirements: Node 22+, pnpm 11+, Docker Desktop.

```bash
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
pnpm db:up          # start PostgreSQL in Docker
pnpm db:migrate     # create the tables
pnpm db:seed        # permissions, roles, admin user, defaults
pnpm dev            # API on :4000, web on :3000
```

- Web: http://localhost:3000 — log in with `admin@erp.local` / `Admin123!` (change it in `apps/api/.env` before seeding). The admin is privileged, so the first sign-in asks to set up two-step verification (any authenticator app).
- Emails in development: http://localhost:4000/api/v1/dev/outbox (only with `MAIL_TRANSPORT=outbox` and `NODE_ENV` ≠ production)
- API docs (Swagger): http://localhost:4000/api/docs
- Health check: http://localhost:4000/api/v1/health

## Useful commands

| Command | What it does |
|---|---|
| `pnpm dev` | Run API + web with hot reload |
| `pnpm test` | API unit tests |
| `pnpm test:e2e` | API end-to-end security suite (uses a separate `erp_test` database; needs `pnpm db:up`) |
| `pnpm typecheck` | Type-check every package |
| `pnpm build` | Production build of everything |
| `pnpm db:migrate` | Create / apply a migration after editing `schema.prisma` |
| `pnpm db:seed` | Re-run the seed (safe to repeat) |
| `pnpm db:reset` | Drop the database, re-apply migrations and seed |
| `pnpm db:studio` | Browse the database in Prisma Studio |
| `pnpm --filter @erp/api admin:unlock <email>` | Break-glass: clear a lockout from the server shell (audited) |

## Architecture

- Design document: [`docs/superpowers/specs/2026-11-21-erp-design.md`](docs/superpowers/specs/2026-11-21-erp-design.md)
- Diagrams (PDF): [`docs/architecture/ERP-Architecture.pdf`](docs/architecture/ERP-Architecture.pdf)

```
apps/api/src
├── common/        guards (JWT + permissions), decorators, helpers
├── core/          auth ✅ (sessions, MFA, resets), users ✅, roles ✅, audit ✅, security ✅, iam (rules), mail
├── modules/       dashboard, inventory, purchasing, sales, invoicing   ← skeletons
├── health/
└── prisma/
apps/web/src
├── app/login                multi-step sign-in (password change, MFA) ✅
├── app/(auth)/*             forgot / reset password, accept invite, verify email ✅
├── app/(erp)/admin/*        users, roles, matrix, audit log, security overview ✅
├── app/(erp)/account        own password, two-step verification, sessions ✅
├── app/(erp)/layout.tsx     sidebar + top bar ✅
├── app/(erp)/dashboard      main ERP page ✅
└── app/(erp)/[...slug]      placeholder for every screen not built yet
```

### How permissions work
1. **Codes** live in `packages/shared/src/permissions.ts` as `module.resource.action` (e.g. `admin.user.deactivate`), each with a label, description and a `sensitive` flag. Sensitive = administration power.
2. **Roles** bundle permissions. Defaults (`packages/shared/src/roles.ts`) are seeded as **system** roles; admins add **custom** roles, start them from a template, compare them and edit everything in the permission matrix. The **Admin** role is protected: it always has every permission and can't be edited or deleted.
3. **Resolution**: a user's permissions are the union of their *active* roles. Temporary assignments stop counting at `expires_at` (no background job — checked on every request). Inactive users have none.
4. **Enforcement**: every API route has `@RequirePermissions(...)` or `@Public()`. Permissions are reloaded on every request, so a change applies immediately. Refused admin requests are written to the audit log as `access.denied`.
5. The web hides menus and buttons with `can('…')` and shows a friendly “no access” page — convenience only; the API is the real check.

### Safeguards
- **No escalation**: you can only grant permissions you hold yourself (role assignment, role edits, matrix, delete-with-reassign).
- **No self-lockout**: you can't change your own roles, deactivate yourself, or remove `admin.role.update` / `admin.permission.manage` / `admin.user.assign_roles` from yourself.
- **Last administrator**: every operation that could leave no active permanent Admin takes a Postgres advisory lock, re-counts inside the transaction and rolls back with 409.
- **Optimistic locking**: roles carry a `version`; stale role or matrix saves get 409 and change nothing.
- **Audit**: every sensitive write records actor, target, before/after, IP and user agent in the same transaction. A DB trigger makes `audit_logs` append-only.

### Sign-in security
- Users are **invited** (they choose their own password); admins never see passwords. Reset and invitation links are single-use, hashed at rest, short-lived and voided when the user is deactivated.
- **Lockout** after repeated failures (policy), rate limits on login, MFA, resets and invitations; public endpoints never reveal whether an email exists.
- **Two-step verification (TOTP)** with 10 single-use recovery codes. Required for privileged users when the policy says so. Secrets are AES-256-GCM encrypted with `MFA_ENCRYPTION_KEY`.
- **Sessions** are server-side: refresh tokens rotate on every use, reuse of an old token ends the session, and deactivation / password reset sign the user out everywhere immediately.
- The **security policy** (password length, lockout, link lifetimes, MFA rule, review cadence, optional HaveIBeenPwned check) is edited on *Administration › Security overview*.

### Email
`MAIL_TRANSPORT=smtp` with the `SMTP_*` variables sends real email. `outbox` is for development only and stores message bodies; with `NODE_ENV=production` (or no transport configured) nothing is stored beyond metadata.

### Break-glass
If every administrator is locked out: `pnpm --filter @erp/api admin:unlock admin@example.com` on the server clears the lockout and writes an audit row (`user.unlocked`, reason “break-glass CLI”).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

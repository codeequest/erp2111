# Administration — Users, Roles, Permissions & Security — Design

Date: 2026-11-25
Status: Draft (awaiting approval)
Source request: "Feature: Admin – Users, Roles & Permissions Management" (full brief from the owner, kept as the requirements list; this document records how it will be built).

## 1. Intent

The ERP's Administration area is a skeleton today: `/users`, `/roles` and `/audit-logs` answer 501, and `/admin/*` pages are placeholders. The owner wants it turned into a complete identity-and-access module for the company's staff, as simple as Auth0, as granular as Keycloak, with Entra-style governance and IAM-style least privilege.

Success: an administrator can onboard staff by invitation, give them exactly the access they need through roles, see and explain anyone's effective permissions, take access away instantly, and prove afterwards who changed what. Every rule is enforced by the API, and nobody (including an admin acting by mistake) can lock the company out or grant themselves more than they hold.

## 2. Goals

- Users: list with smart search, filters, sorting, paging, bulk actions, CSV export; create (invitation-based), edit with before/after review, detail page with Overview / Roles & Permissions / Security / Activity tabs; soft deactivate and reactivate, never delete.
- Roles: list, create (blank / clone / template), edit with impact preview, compare, duplicate, safe delete of custom roles; system roles cannot be deleted; the Admin role cannot be modified.
- Permission matrix: role × permission grid grouped by module, with sticky headers, select-all, search, filter, unsaved-changes tracking, sensitive-change confirmation.
- Account security: invitation and password-reset emails with single-use expiring links, configurable password policy, account lockout, session management, **real TOTP MFA** (authenticator app + recovery codes), forced password change.
- Audit: immutable trail of every sensitive operation with actor, target, before/after, IP, result and reason; searchable page.
- Security overview dashboard; temporary role assignments; access reviews; detection of excessive privilege, never-logged-in and dormant accounts.
- Automated tests for every security rule.

## 3. Non-goals

- SSO / SAML / OIDC federation, passkeys / WebAuthn, SMS or email one-time codes.
- Organisation- or resource-level permission scopes (single company — see design doc §3 of the ERP).
- Explicit "deny" permissions (see §7 resolution strategy).
- Admin-defined permissions (decided: permissions are defined in code, approach A).
- Translating the UI (the app is English-only today; strings stay English, consistent with every existing screen).
- Hard deletion of users, ever.

## 4. Anti-goals (failure even if it "works")

- A permission that is hidden in the UI but callable through the API.
- An admin who can grant a role or permission they do not hold themselves.
- Zero active administrators after any single operation (deactivate, role removal, role edit, expiry).
- A deactivated user whose already-issued access token keeps working until it expires.
- A password, reset link, MFA secret or recovery code readable in the database, logs or audit rows.
- Audit rows that an administrator can edit or delete.

## 5. Approaches considered

| Approach | Trade-off | Decision |
|---|---|---|
| **A. Extend the existing NestJS auth** — permissions stay defined in `packages/shared`, split into granular codes, migrated; new tables for tokens, sessions, MFA, outbox; nodemailer + qrcode as the only new dependencies | Keeps current login and guards; all enforcement in one API; more code to write ourselves | **Chosen by the owner** |
| B. Delegate identity to Keycloak / Auth0 | MFA, resets, lockout for free; new server to run, current login discarded, ERP permission matrix still needed | Rejected |
| C. Admin-created permissions stored only in the DB | Looks flexible, but a permission no code checks protects nothing and misleads admins | Rejected |

MFA scope: the owner chose **real TOTP MFA** over status flags only.

## 6. Constraints found in the codebase

- Stack: NestJS 11 + Prisma 6 + PostgreSQL 17 (`apps/api`), Next.js 15 App Router + React 19 + Tailwind 4 + lucide icons (`apps/web`), shared TS package (`packages/shared`). No TanStack, no form library, no animation library, no i18n are actually installed; screens use hand-written components (see `components/products/ui.tsx`).
- Global guards: `JwtAuthGuard` (loads the user from the DB on every request — role changes apply immediately) then `PermissionsGuard` (`@RequirePermissions`, ALL listed codes required, default 403). Every route is protected unless `@Public()`.
- Passwords already hashed with argon2 (argon2id default). Refresh tokens stored SHA-256 hashed, rotated on use, httpOnly cookie on `/api/v1/auth`. Access token in memory only (15 min).
- `AuditLog` table exists (`user_id, action, entity, entity_id, before, after, ip`), written by `common/audit.ts` inside transactions; product history already reads it.
- Permission codes must match `module.resource.action`; the shared test enforces `^[a-z]+\.[a-z]+\.[a-z]+$` (will be relaxed to allow `_` in the action).
- No email service, no rate limiting, no MFA exist. Docker Postgres is the dev DB.
- Rules from CONTRIBUTING: every endpoint has a permission; audit every change; transactions; never commit `.env`.

## 7. Authorization model

### 7.1 Permission catalogue (code-defined)

Business-module permissions are unchanged. The `admin` module is split into granular codes:

| Code | Sensitive | Replaces |
|---|---|---|
| `admin.user.view` | | `admin.users.manage` |
| `admin.user.create` | | 〃 |
| `admin.user.update` | | 〃 |
| `admin.user.activate` | ✓ | 〃 |
| `admin.user.deactivate` | ✓ | 〃 |
| `admin.user.reset_password` | ✓ | 〃 |
| `admin.user.assign_roles` | ✓ | 〃 |
| `admin.user.manage_mfa` (reset a user's MFA, unlock account) | ✓ | 〃 |
| `admin.user.export` | | 〃 |
| `admin.session.revoke` | ✓ | 〃 |
| `admin.role.view` | | `admin.roles.manage` |
| `admin.role.create` | ✓ | 〃 |
| `admin.role.update` | ✓ | 〃 |
| `admin.role.delete` | ✓ | 〃 |
| `admin.permission.manage` (change which permissions a role holds) | ✓ | 〃 |
| `admin.audit.read` | | unchanged |
| `admin.security.view` (security overview) | | new — granted where `admin.audit.read` was |
| `admin.security.manage` (password / lockout / MFA policy) | ✓ | new — Admin only |
| `admin.settings.manage` | | unchanged |

Each definition gains `label` (short, human: "Deactivate users"), `resource`, `action` and `sensitive`. A role is **privileged** when it holds any sensitive permission. Existing role assignments are migrated by the seed: a role holding an old code receives all codes it replaces, then old codes are removed.

### 7.2 Resolution strategy (documented in code and README)

Effective permissions = **union** of the permissions of the user's role assignments that are not expired (`expires_at IS NULL OR expires_at > now()`), for a user whose status is `ACTIVE` and whose session is not revoked. A lockout only blocks **new password logins**; it does not end sessions already open (otherwise anyone guessing passwords could kick a real user out), so the per-request guard does not check `locked_until`. Anything not granted is denied. There are no deny rules, so precedence is never ambiguous. No scopes.

### 7.3 Safeguards (one `AccessPolicy` service, pure functions, unit-tested)

1. **No escalation:** an actor can only assign a role, create a role, or add a permission to a role if every permission involved is already in the actor's own effective set. Enforced server-side on every write, including bulk and matrix saves; manipulated requests fail with 403.
2. **No self-modification:** an actor cannot change their own role assignments, deactivate themselves, or reset their own MFA through admin endpoints (self-service has its own flows).
3. **No lock-out of oneself:** editing a role the actor holds may not remove `admin.role.update`, `admin.permission.manage` or `admin.user.assign_roles` from the actor's effective set.
4. **Last administrator:** any operation that would leave zero `ACTIVE` users holding a non-expiring assignment of the **Admin** role is rejected. Lockouts are ignored by this count because they expire on their own, so an attacker locking every admin by failed logins cannot defeat it; a break-glass CLI (`pnpm --filter @erp/api admin:unlock <email>`) clears a lockout from the server. Checked inside the transaction under a Postgres advisory lock so two concurrent requests cannot both pass.
5. **Protected roles:** `Admin` is `SYSTEM` + `is_protected`: name and permissions immutable (always the full catalogue, re-synced by the seed), never deletable. Other seeded roles are `SYSTEM` (not deletable, not renamable, permissions editable). Admin-created roles are `CUSTOM`.
6. **Privileged roles require MFA** when the policy `requireMfaForPrivileged` is on (default on): assigning a privileged role sets the user's `mfa_required`; at next login they must enroll.

## 8. Data model changes (Prisma, one migration + seed)

- `User`: add `first_name`, `last_name` (existing `full_name` kept and maintained as `first + ' ' + last` so current code keeps working; migration splits existing names on the first space), `username` (nullable, unique, stored lower-case), `phone`, `department`, `job_title`, `employee_id`, `metadata` (JSON key → string, "custom user metadata"), `status` enum `PENDING | ACTIVE | INACTIVE` (replaces `is_active`), `password_hash` becomes nullable (invited users have none), `email_verified_at`, `password_changed_at`, `must_change_password`, `mfa_required`, `failed_login_count`, `locked_until`, `deactivated_at`, `deactivated_by_id`, `deactivation_reason`, `access_reviewed_at`, `access_reviewed_by_id`. "Locked" is shown as a status in the UI but derived from `locked_until > now()`. Existing users migrate to `ACTIVE`/`INACTIVE`, verified, `password_changed_at = created_at`.
- `Role`: `type` enum `SYSTEM | CUSTOM` (replaces `is_system`), `is_protected`, `color` (one of a fixed palette key), `category` (free text, optional), `version` int (optimistic locking for the matrix and editor).
- `UserRole`: add `assigned_by_id`, `expires_at` (temporary assignments).
- `Permission`: add `resource`, `action`, `label`, `sensitive` (seeded from code).
- `Session` (new): `id, user_id, created_at, last_seen_at, expires_at, revoked_at, revoked_reason, ip, user_agent`. `RefreshToken` gains `session_id`; rotation stays per token. Presenting an already-rotated refresh token revokes the whole session (theft detection). The access token carries `sid`; `JwtAuthGuard` rejects it if the session is revoked — so deactivation and "revoke session" take effect on the next request, not after 15 minutes.
- `UserToken` (new): `id, user_id, type (INVITATION | PASSWORD_RESET | EMAIL_VERIFICATION), token_hash (SHA-256), expires_at, used_at, created_by_id, created_at`. Issuing a token invalidates earlier unused tokens of the same type for that user; using one marks it used.
- `UserMfa` (new): `user_id PK, secret_enc` (AES-256-GCM, key from `MFA_ENCRYPTION_KEY`), `enabled_at`, `last_used_step` (blocks replay of a code in the same 30 s window). `MfaRecoveryCode` (new): `user_id, code_hash (argon2), used_at` — 10 codes, shown once.
- `SecurityPolicy` (new, single row id = 1): `password_min_length` (12), `password_max_length` (128), `block_breached_passwords` (on: local list), `breach_api_check` (off: optional HaveIBeenPwned k-anonymity lookup), `lockout_threshold` (5), `lockout_minutes` (15), `invitation_ttl_hours` (72), `reset_ttl_minutes` (60), `require_mfa_for_privileged` (on), `access_review_days` (90), `dormant_days` (60), `revoke_sessions_on_password_reset` (on). Editable by `admin.security.manage`.
- `AuditLog`: add `target_label` (name/email at the time), `result` (`SUCCESS | FAILURE | DENIED`), `reason`, `user_agent`. FK to users becomes `RESTRICT` (users are never deleted). A Postgres trigger rejects `UPDATE` and `DELETE` on `audit_logs` — immutability is enforced by the database, not just by the absence of endpoints.
- `EmailOutbox` (new): `id, to, template, subject, status (QUEUED | SENT | FAILED), error, created_at, sent_at`, and `body` **only when the dev transport is active** (so a live reset link is never stored in production).

## 9. Authentication flows

- **Login** `POST /auth/login`: generic "Invalid email or password" for unknown / wrong / inactive / pending. Failed attempts increment `failed_login_count`; at the threshold the account locks for `lockout_minutes` (audit `user.locked`). Then, in order, the response is either a session or a **challenge** (`{ challenge: 'mfa' | 'mfa_enroll' | 'password_change', challengeToken }`, a 5-minute single-purpose JWT):
  - `mfa` → `POST /auth/mfa/verify { challengeToken, code | recoveryCode }`
  - `mfa_enroll` (policy requires it, not enrolled) → `POST /auth/mfa/enroll/start` (returns otpauth URI + QR data URL) → `/enroll/confirm { code }` (returns recovery codes once)
  - `password_change` (`must_change_password`) → `POST /auth/password/change-required { challengeToken, newPassword }`
  Only when every step is done is a `Session` created. Rate limit: 10 login attempts / 15 min per IP + email, 5 MFA attempts per challenge.
- **Forgot password** (public, login page link) and **admin-triggered reset**: same `PASSWORD_RESET` token, emailed link `/reset-password#token=…` (fragment, so it never reaches server logs or Referer). Response is always generic. Rate limit 3 per email per hour + per IP. Successful reset: policy check, argon2 hash, `password_changed_at`, clear lockout, mark token used + invalidate other reset tokens, revoke all sessions (policy), notification email "your password was changed".
- **Invitation**: creating a user with "send invitation" sets `PENDING` and emails `/accept-invite#token=…` (72 h). Accepting sets the password (policy), marks email verified, status `ACTIVE`, then continues to MFA enrollment if required. Admin can resend (old link stops working) or revoke.
- **Email change** by an admin clears `email_verified_at` and sends an `EMAIL_VERIFICATION` link; the user can still log in (verification status is visible and filterable).
- **Self-service** `/account/security`: change password, enroll / disable MFA (disable requires a current code; blocked when MFA is required for the user), regenerate recovery codes, list and revoke own sessions.
- **Password policy** (`PasswordPolicy`, server-side, also exposed via `GET /auth/password-policy` for live hints): length between min and max, not in the bundled common-password list (~10k entries), must not contain the email local part, username, first or last name (case-insensitive, ≥ 3 chars), confirmation must match (client). No composition rules, no periodic expiry. Paste allowed, `autocomplete="new-password"`. Passwords are never logged (ValidationPipe errors never echo values).

## 10. API surface (all under `/api/v1`, each with its permission)

- Users: `GET /users` (search, filters, sort, page, pageSize ∈ 10/25/50/100), `GET /users/stats`, `GET /users/export` (CSV of filter or `ids`), `GET /users/:id`, `GET /users/:id/effective-permissions` (each permission with the roles granting it), `POST /users`, `PATCH /users/:id`, `PUT /users/:id/roles` (with `expiresAt` per role), `POST /users/:id/deactivate {reason}`, `POST /users/:id/activate`, `POST /users/:id/reset-password`, `POST /users/:id/invitation` (send / resend), `DELETE /users/:id/invitation`, `POST /users/:id/force-password-change`, `POST /users/:id/unlock`, `DELETE /users/:id/mfa`, `GET /users/:id/sessions`, `DELETE /users/:id/sessions[/:sid]`, `POST /users/:id/access-review`, `POST /users/bulk` (`activate | deactivate | assignRoles | removeRoles`, ≤ 200 ids, per-user result `updated | skipped | failed + reason`). No delete route exists.
- Roles: `GET /roles` (search, type, sort, page), `GET /roles/templates`, `GET /roles/compare?ids=`, `GET /roles/:id` (with users), `POST /roles` (optionally `cloneFromId` / `templateKey`), `PATCH /roles/:id` (requires `version`), `POST /roles/:id/impact` (dry run: added, removed, sensitive changes, affected users), `DELETE /roles/:id` (custom only; with `reassignToRoleId` when users hold it — reassignment and deletion in one transaction).
- Permissions: `GET /permissions` (catalogue grouped module → resource), `GET /permissions/matrix`, `PUT /permissions/matrix` (changed roles with their `version`; all-or-nothing transaction; 409 on stale version).
- Audit: `GET /audit-logs` (actor, target type / id, action, result, date range, text), `GET /audit-logs/:id`. No write routes.
- Security: `GET /security/overview`, `GET|PATCH /security/policy`.
- Auth additions: see §9. Dev only (`MAIL_TRANSPORT=outbox`): `GET /dev/outbox` to open emailed links locally.

Every sensitive write runs in a transaction with its audit row. Errors never reveal whether an email exists (public routes) and never include stack traces.

**Audit actions:** `user.created, user.updated, user.activated, user.deactivated, user.roles_assigned, user.roles_removed, user.invited, user.invitation_revoked, user.password_reset_requested, user.password_reset, user.password_changed, user.locked, user.unlocked, user.mfa_enrolled, user.mfa_disabled, user.mfa_reset, user.access_reviewed, session.revoked, role.created, role.updated, role.deleted, role.permissions_added, role.permissions_removed, security.policy_updated, auth.login, auth.login_failed`, plus `access.denied` for 403s on admin routes.

## 11. Web UI

Navigation (Administration): **Users · Roles & permissions · Audit log · Security overview · Settings**. Admin pages reuse the existing visual language (white cards, slate, rounded-xl, lucide icons, module accent) and add shared building blocks: data table with sticky header, filter panel, drawer, confirm dialog with optional reason field and typed confirmation for the most dangerous actions, toast notifications, skeleton loaders, empty states with icon + guidance, CSS motion (staggered fade-in, counters animating up, error shake, success check). Desktop and tablet are first-class; phones get stacked layouts.

- **Users** `/admin/users`: stat cards (total, active, pending, locked, without MFA) that double as quick filters; search with debounce and highlighted matches; filter panel (status, roles multi-select, MFA, verified, department, created range, last-login range, never logged in); sortable columns; page size; filters kept in the URL so Back restores them; selection + bulk toolbar; row → detail page.
- **New / edit user** `/admin/users/new`, `/admin/users/:id/edit`: sections General · Access · Account; role picker with descriptions, privileged badge, live effective-permission preview; account options (send invitation now, require MFA, require password change); edit shows a before/after review step for email, status and role changes.
- **User detail** `/admin/users/:id`: header with avatar, status, quick actions; tabs Overview, Roles & Permissions (assignments with expiry, effective permissions with source roles), Security (verification, MFA, password age, lockout, sessions with revoke, reset password, force change, reset MFA, activate / deactivate), Activity (audit entries where the user is actor or target).
- **Roles** `/admin/roles`: cards/table with type, user count, permission count, colour, dates; search, type filter, sort; duplicate; compare (pick 2–4 → side-by-side diff); link to matrix.
- **Role editor** `/admin/roles/new`, `/admin/roles/:id`: start from blank / clone / template; single-role permission checklist by module with live count and privileged warning; assigned users tab; save shows the impact preview and needs explicit confirmation for sensitive additions or removals.
- **Permission matrix** `/admin/roles/matrix`: rows = permissions grouped by module (collapsible, tri-state module checkbox: all / some / none), columns = roles (sticky header, protected Admin column locked with a padlock), sticky first column, horizontal scroll, search and module filter, per-role select-all / clear, unsaved-changes bar with count and leave-page warning, review dialog listing sensitive changes and affected users before applying.
- **Audit log** `/admin/audit`: filters (actor, target, action, result, date range), table, drawer with before/after diff.
- **Security overview** `/admin/security`: totals, users without MFA, privileged users, pending invitations, locked accounts, never logged in, dormant, overdue access reviews, recent admin activity, and the policy editor.
- **Public pages**: `/login` (adds MFA step, enrollment and required password change), `/forgot-password`, `/reset-password`, `/accept-invite`, `/verify-email`; **`/account/security`** linked from the top bar. Password fields show live policy checks and a strength hint.

## 12. Email

`MailService` with two transports chosen by `MAIL_TRANSPORT`: `smtp` (nodemailer, `SMTP_*` env vars) and `outbox` (dev default: stored with body, viewable at `/dev/outbox`). Every send is recorded in `EmailOutbox`. Templates (plain HTML + text, company name from settings): invitation, password reset, password changed, email verification, account deactivated (optional, off by default), MFA reset by admin. Links use `WEB_ORIGIN`.

## 13. Testing

- Unit (Jest): password policy, TOTP against RFC 6238 vectors and drift window, AES-GCM secret round-trip, token issue/consume/expiry/single-use, permission resolution (union, expiry, inactive, locked), every `AccessPolicy` rule (§7.3), rate limiter, legacy permission migration mapping, CSV export escaping, impact-preview diff.
- API e2e (Supertest against the Docker test DB): login + lockout, MFA login and enrollment, reset flow end to end via the outbox, deactivate revokes a live token, privilege-escalation attempts via crafted requests, last-admin protection, protected-role edits, audit immutability trigger.
- Manual browser walk-through of every screen at desktop and tablet widths.

## 14. Delivery

Branch `feature/admin-iam`, committed phase by phase in the order of the brief (schema → API & security → users UI → roles UI → matrix → emails & lifecycle → audit & dashboard → tests → polish & docs). `pnpm typecheck` and `pnpm test` stay green at each commit. README "How permissions work" is updated with the resolution strategy and new codes.

## 15. Decisions made by the owner

- UI standard: **match the ERP as it is** — English only, polished CSS motion (staggered entrances, counters, error shake, success checks), no framer-motion or next-intl.
- **A real SMTP provider will exist in production.** Email is the only channel for invitation and reset links; there is no "copy link" fallback.

## 15b. Decisions made by the designer (owner can override)

- The existing data is dev/seed only (v0.1): one data-preserving migration plus reseed; no staged migration.
- After deploy, existing admins hold a privileged role and are asked to enrol MFA at their next login. TOTP enrolment needs no email, so this cannot lock anyone out.

- Seeded roles other than Admin become `SYSTEM` (undeletable, permissions editable); Admin is protected.
- "Locked" is derived from a lockout timestamp rather than stored as a status, so it expires on its own.
- "Require password change on first login" is redundant with invitations (the user sets their own password) and is offered instead as "force password change at next login" for existing users.
- Rate limiting is in-memory (single-server deployment per the ERP design); swap for Redis if the API is ever scaled out.
- Breach check against HaveIBeenPwned is available but off by default because it calls an external service; the local common-password list is always on.
- New environment variables: `MFA_ENCRYPTION_KEY`, `MAIL_TRANSPORT`, `MAIL_FROM`, `SMTP_HOST/PORT/USER/PASSWORD/SECURE`.

## 16. Left to the builder

- Component and file layout inside `apps/web/src/components/admin` and `apps/api/src/core/*`.
- Exact Tailwind styling, icons and motion timings.
- The common-password list source (a public top-10k list, bundled as a text file).
- Whether the matrix virtualises rows (only if performance requires; ~55 permissions today).

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

- Web: http://localhost:3000 — log in with `admin@erp.local` / `Admin123!` (change it in `apps/api/.env` before seeding)
- API docs (Swagger): http://localhost:4000/api/docs
- Health check: http://localhost:4000/api/v1/health

## Useful commands

| Command | What it does |
|---|---|
| `pnpm dev` | Run API + web with hot reload |
| `pnpm test` | API unit tests |
| `pnpm typecheck` | Type-check every package |
| `pnpm build` | Production build of everything |
| `pnpm db:migrate` | Create / apply a migration after editing `schema.prisma` |
| `pnpm db:seed` | Re-run the seed (safe to repeat) |
| `pnpm db:reset` | Drop the database, re-apply migrations and seed |
| `pnpm db:studio` | Browse the database in Prisma Studio |

## Architecture

- Design document: [`docs/superpowers/specs/2026-11-21-erp-design.md`](docs/superpowers/specs/2026-11-21-erp-design.md)
- Diagrams (PDF): [`docs/architecture/ERP-Architecture.pdf`](docs/architecture/ERP-Architecture.pdf)

```
apps/api/src
├── common/        guards (JWT + permissions), decorators, helpers
├── core/          auth ✅, users, roles, settings, audit
├── modules/       dashboard, inventory, purchasing, sales, invoicing   ← skeletons
├── health/
└── prisma/
apps/web/src
├── app/login                login page ✅
├── app/(erp)/layout.tsx     sidebar + top bar ✅
├── app/(erp)/dashboard      main ERP page ✅
└── app/(erp)/[...slug]      placeholder for every screen not built yet
```

### How permissions work
1. Permission codes live in `packages/shared/src/permissions.ts` (`module.resource.action`).
2. Roles bundle permissions; defaults are in `packages/shared/src/roles.ts` and seeded into the DB.
3. The API checks them on every endpoint with `@RequirePermissions('sales.order.confirm')` → **403** if missing.
4. The web menu and buttons are filtered with `can('…')` — for convenience only; the API is the real check.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

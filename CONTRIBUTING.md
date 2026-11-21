# Contributing

## Workflow
1. Pick an issue (one screen or one module feature at a time).
2. Branch from `main`: `feature/<module>-<short-name>`, e.g. `feature/inventory-products`.
3. Keep `pnpm typecheck` and `pnpm test` green; add tests for business rules.
4. Open a pull request to `main` and ask for one review. Don't push directly to `main`.

## Building a feature (example: Inventory › Products)

**API** — `apps/api/src/modules/inventory/`
- Replace `notImplemented(...)` in `products.controller.ts` with calls to `InventoryService`.
- Add DTOs with `class-validator` for request bodies (they show up in Swagger).
- Keep the `@RequirePermissions(...)` decorators — routes and permissions are already decided.

**Web** — create `apps/web/src/app/(erp)/inventory/products/page.tsx`.
Next.js then uses your page instead of the placeholder. Call the API with `api()` from `@/lib/api`.

**Database** — edit `apps/api/prisma/schema.prisma`, then `pnpm db:migrate` and commit the generated migration.

## Rules that must not be broken
- **Money and quantities are `Decimal`**, never `number`/`Float` in the database.
- **Stock is never edited directly.** Write a `StockMove` row and update `StockBalance` in the **same** `prisma.$transaction`.
- **Posted invoices / confirmed documents are immutable.** Correct them with a credit note, a return or a cancellation.
- **Every endpoint has a permission.** New permission? Add it to `packages/shared/src/permissions.ts`, give it to roles in `roles.ts`, run `pnpm db:seed`.
- **Write an `AuditLog` row** for every create / update / status change of a business document.
- Never commit `.env` files.

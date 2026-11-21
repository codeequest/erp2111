# ERP for a Trading / Retail Company — Design

Date: 2026-11-21
Status: Draft (awaiting approval)

## 1. Intent

Build a custom ERP for **one specific trading/retail company**. It covers buying goods from suppliers, keeping track of stock, selling to customers, and invoicing. Different staff get different access **per module**, and an admin controls who can do what.

Success means staff run the daily cycle in the system: purchase, receive, stock, sell, deliver, invoice, get paid. The stock figures and invoice totals must be trustworthy, and nobody sees or does more than their role allows.

## 2. Goals

- Four business modules: **Inventory, Purchasing, Sales, Invoicing**.
- **Users & Roles** administration with permissions per module (and per action inside a module).
- A dashboard with key figures (sales today/month, low stock, unpaid invoices).
- A clean web UI usable by non-technical staff.
- An API that a future mobile app or point-of-sale screen could reuse.

## 3. Non-goals (not in v1)

- Full accounting (general ledger, chart of accounts, balance sheet).
- HR, payroll, manufacturing, projects.
- Point-of-sale till screen, e-commerce storefront.
- Multi-company / SaaS for other businesses.
- Multi-currency (a single base currency is configured).

## 4. Anti-goals (failure even if it "works")

- **Stock that can silently drift.** Stock is never a hand-edited number. It is always computed from a ledger of stock movements, and every change has a reason and an author.
- **Permissions enforced only in the UI.** The API is the source of truth. Hiding a button is not security.
- **Money stored as floating point.** All amounts use `Decimal`.
- Confirmed documents (invoices, receipts) that can be edited after the fact. They can only be cancelled or corrected with a new document (credit note, return).

## 5. Approaches considered

| Approach | Trade-off | Decision |
|---|---|---|
| **Next.js frontend + NestJS API + PostgreSQL/Prisma** | Two apps to run; NestJS modules map 1:1 to ERP modules, guards make per-module permissions clean, API reusable for mobile/POS | **Chosen** by the user |
| Next.js full-stack only | Fastest start, one codebase; business logic tangles with UI as the ERP grows | Rejected |
| Next.js + Express | Lighter, but module structure, validation and permission system must be hand-built | Rejected |
| Microservices | Operational complexity with no benefit for one company | Rejected |

Architecture style: **modular monolith**, the same style Odoo and ERPNext use. It is one API process, split into modules that share one PostgreSQL database. Modules talk to each other through service interfaces, never by reaching into each other's tables directly.

## 6. Stack

- **Monorepo** (pnpm workspaces): `apps/web` (Next.js), `apps/api` (NestJS), `packages/shared` (shared TypeScript types, Zod schemas, permission codes).
- **Frontend:** Next.js (App Router) + TypeScript, Tailwind CSS + shadcn/ui, TanStack Query (data fetching), TanStack Table (data grids), react-hook-form + Zod (forms).
- **Backend:** NestJS + TypeScript, Prisma ORM, PostgreSQL. Validation with Zod or class-validator. OpenAPI/Swagger docs generated from the API.
- **Auth:** email + password (argon2 hashing). Short-lived JWT access token plus refresh token in an httpOnly cookie. No public sign-up: the admin creates accounts.
- **Dev environment:** Docker Compose for PostgreSQL; `.env` files for config.
- **Testing:** Jest for unit tests of business rules (stock, totals, status transitions), API e2e tests with Supertest against a test database, and Playwright for a few critical UI flows.

## 7. Users, roles and permissions

**Model:** `User` ⟷ `Role` (many-to-many) ⟷ `Permission` (many-to-many).

- **Permissions** are fixed codes defined in code and seeded into the DB, in the form `module.resource.action`, e.g.:
  - `inventory.product.read`, `inventory.product.write`, `inventory.stock.adjust`, `inventory.cost.view`
  - `purchasing.order.read`, `purchasing.order.write`, `purchasing.order.confirm`, `purchasing.receipt.create`
  - `sales.order.read`, `sales.order.write`, `sales.order.confirm`, `sales.delivery.create`
  - `invoicing.invoice.read`, `invoicing.invoice.write`, `invoicing.invoice.post`, `invoicing.payment.record`
  - `admin.users.manage`, `admin.roles.manage`, `admin.settings.manage`
- **Roles** are created and edited by the admin in the UI as bundles of permissions. Seeded defaults: **Admin** (all, cannot be deleted), **Sales clerk**, **Purchaser**, **Storekeeper**, **Accountant**, **Viewer** (read-only).
- A user can hold several roles; their effective permissions are the union.
- **Enforcement:** a NestJS guard plus a `@RequirePermissions('sales.order.confirm')` decorator on every endpoint. The frontend receives the user's permission list at login and hides menus and buttons accordingly, for convenience only.
- **Sensitive fields:** purchase cost and margin are returned by the API only to users with `inventory.cost.view`.
- Admin can deactivate a user (no deletion, to keep history) and reset their password.

## 8. Modules

### Inventory
- Products (SKU, barcode, name, category, unit, sale price, cost, tax rate, min stock level, active flag), categories, units of measure.
- **Warehouses / locations**, supported from day one even if the company starts with one.
- **Stock movements ledger:** every in/out/transfer/adjustment is a row (product, warehouse, quantity ±, type, source document, user, date). On-hand stock = sum of movements, with a maintained per-product-per-warehouse balance table updated in the same transaction for fast reads.
- Stock adjustments (with reason) and inter-warehouse transfers.
- Low-stock list (on hand < min level).
- Costing method: **weighted average cost**, updated on each receipt.

### Purchasing
- Suppliers (contact info, payment terms).
- Purchase orders: `draft → confirmed → partially received → received`, or `cancelled`.
- Goods receipts against a PO (partial receipts allowed) create stock-in movements and update average cost.
- Supplier bills are recorded in Invoicing (below).

### Sales
- Customers (contact info, payment terms, optional credit limit).
- Quotations → sales orders: `draft → confirmed → partially delivered → delivered`, or `cancelled`.
- Deliveries against a sales order (partial allowed) create stock-out movements.
- Confirming a sales order or delivery **blocks** if stock would go negative (a configurable setting, default: block).
- Returns create stock-in movements and can trigger a credit note.

### Invoicing
- Customer invoices created from sales orders/deliveries (or manually); supplier bills created from purchase orders/receipts.
- Lifecycle: `draft → posted → partially paid → paid`, or `cancelled`. Posted invoices are immutable; corrections go through **credit notes**.
- Payments (date, amount, method: cash / bank transfer / cheque / card), with partial payments allowed. Outstanding balance per customer/supplier.
- Tax rates are configurable (e.g. VAT %); line totals, tax totals and grand total are computed server-side.
- Sequential document numbering per type (e.g. `INV-2026-00001`, `PO-2026-00001`, `SO-…`), gap-free, generated inside the DB transaction.
- PDF export for invoices, POs, and delivery notes, with company logo and details from Settings.

### Cross-cutting
- **Settings:** company name, address, tax ID, logo, base currency, default tax rate, numbering formats, negative-stock policy.
- **Audit log:** who did what, and when, on every create/update/status change of business documents and on user/role changes.
- **Dashboard:** sales today/month, top products, low-stock items, unpaid/overdue invoices, filtered by what the user is allowed to see.
- Lists support search, filters, sorting, pagination and CSV export.

## 9. Data integrity rules

- Every operation that touches stock or money runs in **one database transaction** (e.g. receipt = receipt row + stock moves + balance update + average cost update).
- Amounts are `Decimal(18,4)` for quantities and unit prices and `Decimal(18,2)` for document totals, and rounding is done in one shared helper.
- Soft-delete (active flag) for master data (products, customers, suppliers, users); business documents are cancelled, never deleted.

## 10. Build order

1. Monorepo skeleton, Docker Postgres, Prisma, CI lint/test.
2. Auth + Users + Roles + Permissions (guard, decorator, admin UI), Settings, Audit log.
3. Inventory: products, warehouses, stock ledger, adjustments, transfers.
4. Purchasing: suppliers, POs, receipts.
5. Sales: customers, quotations/orders, deliveries, returns.
6. Invoicing: invoices, supplier bills, payments, credit notes, PDFs.
7. Dashboard and reports.

Each step ends with a usable, tested slice.

## 10b. Decisions made by the designer (owner can override)

- **Units:** each product has a base unit (stock is kept in it) plus optional purchase/sale units with a conversion factor (e.g. 1 carton = 24 pieces). Ledger and average cost are always in the base unit.
- **Discounts:** line discount (%) and document discount (%/amount) on quotations, sales orders and invoices. No price lists or promotions in v1.
- **Credit limit:** exceeding it shows a **warning** at sales order confirmation; confirming anyway requires `sales.credit.override`.
- **Cost vs bill:** average cost is updated at goods receipt using the PO price. Differences on the supplier bill are recorded but do not revalue stock in v1. Landed costs (freight, customs) are a non-goal for v1.
- **Go-live data:** CSV import for products, customers and suppliers. An "opening balance" stock movement type for initial stock and cost per warehouse, and opening-balance documents for customer/supplier balances. No migration of open orders.
- **Hosting:** one cloud server (Docker), online-only. Offline operation is a non-goal.

## 11. Left to the builder

- Exact folder layout inside each app, naming conventions, and UI component structure.
- Choice between Zod and class-validator in NestJS (keep shared Zod schemas if feasible).
- PDF library (e.g. a headless-browser render or `pdfmake`).
- Exact dashboard charts.

## 12. Open questions for the owner

- Interface language(s), and whether right-to-left (Arabic) support is needed.
- Base currency and tax rules (one VAT rate or several; any withholding/stamp tax on invoices).
- Number of shops/warehouses at launch.

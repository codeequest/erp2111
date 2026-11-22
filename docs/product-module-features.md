# Products module: suggested features

Most of what the module needs is already in the database (`Product`, `Category`, `Unit`,
`ProductUnit`, `TaxRate`, `StockBalance`, `StockMove`, `AuditLog`), and the permissions
already exist (`inventory.product.read`, `inventory.product.write`, `inventory.cost.view`).
Phases 1 and 2 need almost no database changes.

Today the web page is a placeholder and every API endpoint answers **501 Not Implemented**.

---

## Phase 1: Core (needed before anything else)

### 1. Product list page

- Table: SKU, name, category, base unit, sale price, stock on hand, active/inactive badge.
- Search by name, SKU or barcode.
- Filters: category, active status.
- Server-side paging and sorting, so it stays fast with thousands of products.

### 2. Create and edit a product

- Fields: SKU, barcode, name, description, category, base unit, tax rate, sale price, minimum stock.
- SKU and barcode must be unique, with a clear error if already taken.
- Needs `inventory.product.write`. Users with only `inventory.product.read` see the form read-only.

### 3. Deactivate instead of delete

- A product used in orders or invoices can't be safely deleted, so it is switched off
  (the `isActive` flag already exists).
- Inactive products are hidden from new sales and purchase orders but stay in history.

### 4. Product details page

- Product info, stock in each warehouse, most recent stock movements.

### 5. Cost protection

- Average cost is visible only with `inventory.cost.view`; the API removes it for everyone else.

---

## Phase 2: Things a trading company needs early

### 6. Categories with sub-categories

- Create, edit and move categories in a tree (parent categories already supported).

### 7. Units and packaging

- Manage units such as PCS, CTN, KG.
- Per product, define pack sizes such as "1 carton = 24 pieces", with their own barcode
  and price per pack (`ProductUnit` table already exists).

### 8. Tax rate on each product

- Used later by sales and invoices.

### 9. Barcode lookup

- Scan or type a barcode and jump straight to the product. Sales and purchase screens reuse it.

### 10. Low-stock alerts

- Products whose stock is below their minimum level.
- Fills the "Low-stock items" card on the dashboard, which is currently empty.

---

## Phase 3: Productivity and control

### 11. Import and export (Excel / CSV)

- Bulk-load the catalogue, with a report of the rows that failed and why.

### 12. Change history

- Who changed the price, cost or minimum stock, and when (uses the existing audit log).

### 13. Bulk actions

- Change prices by a percentage, move products to another category, deactivate many at once.

### 14. Product images

- Needs a small database change and somewhere to store the files.

---

## Later (larger database changes)

- Price lists for wholesale and retail customers
- Product variants (size, color)
- Batch or serial-number tracking with expiry dates
- Preferred supplier per product, with the supplier's own product code
- Printing barcode labels

---

## Recommendation

Build **Phase 1 plus items 6–8** first. That gives a working product catalogue end to end,
and the Purchasing and Sales modules can build on it next.

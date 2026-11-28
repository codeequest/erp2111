# Stock Engine — Development Plan (proposal)

Date: 2026-11-27
Status: Proposal, waiting for the owner's decisions (see the last section)

---

## 1. What already exists

The foundation is good:

- `stock_moves`: an append-only ledger (signed quantity, `unitCost`, link to the
  source document, `transferId`).
- `stock_balances`: cached on-hand quantity per product and warehouse.
- `Product.averageCost` (weighted average cost) and
  `CompanySettings.allowNegativeStock`.
- Placeholder endpoints in `stock.controller.ts` and `warehouses.controller.ts`
  (they return 501 for now), with their permissions already in place.

**Missing:** the engine itself, meaning one service that every module goes
through to change stock.

---

## 2. Suggestions

### 2.1 One `StockEngine` service is the only writer of stock

Nothing else (purchasing, sales, returns, adjustments) may write to
`stock_moves` or `stock_balances` directly. Every module calls the engine
inside its own database transaction:

```ts
stockEngine.post(tx, {
  sourceType: 'GoodsReceipt',
  sourceId,
  reference: 'GR-2026-00012',
  lines: [
    { productId, warehouseId, quantity: +24, unitCost: 3.5, type: 'RECEIPT' },
  ],
}, user);
```

For each line, the engine:

1. checks the rules (negative stock, active product, active warehouse),
2. locks the balance row,
3. inserts the move,
4. updates the balance,
5. updates the average cost,
6. writes the audit entry.

This follows the spec's rule that "modules talk through service interfaces",
and it is what stops stock from drifting.

### 2.2 Handle concurrency from day one

This is where most home-built ERPs break. If two users deliver the last unit
at the same moment, stock goes negative.

- Update balances atomically:
  `UPDATE stock_balances SET quantity = quantity + $d WHERE ... AND quantity + $d >= 0`.
  If no row is updated, there isn't enough stock.
- Use `upsert` for the first move of a product in a warehouse.
- Sort the lines by `(productId, warehouseId)` before locking, so two
  transfers going in opposite directions cannot deadlock.
- Lock the `Product` row (`SELECT ... FOR UPDATE`) when recalculating the
  average cost.

### 2.3 Costing rules (weighted average)

| Move | Cost rule |
|---|---|
| Receipt | `newAvg = (onHandAll × avg + qty × cost) / (onHandAll + qty)`. Cost stays company-wide, which matches the schema |
| Delivery / negative adjustment | Save the current average cost in `unitCost`. That is the cost of goods sold, frozen at that moment |
| Transfer | Moves stock at the current average and does not change it |
| Customer return | Comes back at the cost of the original delivery, not today's average |
| Edge case | When on-hand is zero or negative, the receipt cost becomes the new average. Never divide by zero |

### 2.4 Schema additions to make before starting

| Addition | Why |
|---|---|
| `StockAdjustment` / `StockTransfer` header + line tables, numbered with `DocumentSequence` (`ADJ-…`, `TRF-…`) | Adjustments and transfers become real documents you can print, approve and audit, not loose ledger rows |
| `StockMove.sourceLineId` + unique index `(sourceType, sourceId, sourceLineId, type)` | Posting is idempotent: a double-click cannot post stock twice |
| `StockMove.reversesMoveId` | Mistakes are fixed by posting a reversal, never by editing |
| `CHECK (quantity <> 0)` + a DB trigger that blocks UPDATE/DELETE on `stock_moves` | The database enforces the "append-only" rule, not just convention |
| `StockBalance.reserved` (quantity reserved by confirmed sales orders) | Lets you show **available = on hand − reserved**, so the same stock is never promised twice |
| `StockCount` + `StockCountLine` (physical inventory) | Storekeepers count, the system calculates the differences, and posting generates the adjustments. Retail needs this early |

### 2.5 Leave out of v1 (without blocking it later)

- Lots, serial numbers, expiry dates
- Bin locations inside a warehouse
- An "in transit" step for transfers
- Landed costs (freight, customs)

Keep `productId + warehouseId` as the key for now. Adding a nullable `lotId`
later won't break anything.

### 2.6 Reports and safety checks

- **Stock levels**: on hand, reserved, available, low-stock flag, value.
- **Ledger** with a running balance.
- **Stock on a given date**, calculated from the moves (for month-end).
- **Valuation** (quantity × average cost). Only users with
  `inventory.cost.view` can see it.
- **Reconciliation check** (endpoint or nightly job): compare
  `stock_balances` with `SUM(stock_moves)` and raise an alert on any
  difference.

### 2.7 Tests that matter

- Average cost math, including the zero and negative stock cases
- The negative-stock block
- **Concurrency**: two parallel deliveries of the last unit, only one succeeds
- Re-posting the same document is idempotent
- The reconciliation check

---

## 3. Proposed build order

1. Schema migration (additions above) + `StockEngine.post()` + unit tests
2. Warehouses CRUD + opening balances (CSV import at go-live)
3. Adjustments and transfers (documents + endpoints) + web screens
4. Stock levels, ledger and low-stock views
5. Stock counts (physical inventory)
6. Hook purchasing receipts and sales deliveries into the engine, as those
   modules are built

---

## 4. Decisions needed from the owner

1. **Reservations:** should confirmed sales orders reserve stock, or only
   deliveries reduce it?
2. **Adjustment approval:** post immediately, or draft first and then a
   manager approves?
3. **Lots or expiry dates:** does the company sell perishable or serialized
   goods? That decides whether lots stay out of v1.
4. **Number of warehouses at launch** (still an open question in the design
   spec).

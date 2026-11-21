'use client';

import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { listWarehouses, openingBalances, toNum, type Warehouse } from '@/lib/inventory';
import { btnPrimary, inputBase } from './ui';

interface Row {
  quantity: string;
  cost: string;
  lotNumber: string;
  expiryDate: string;
}

/**
 * Opening stock for one product, in the warehouses where it has never had stock.
 * Lot-tracked products: enter every lot of the warehouse at once (one row per lot).
 * After that, quantities change only through receipts, deliveries and adjustments.
 */
export function OpeningStockForm({
  productId,
  unitCode,
  usedWarehouseIds,
  trackLots,
  defaultCost,
  onSaved,
}: {
  productId: string;
  unitCode: string;
  usedWarehouseIds: string[];
  trackLots: boolean;
  /** Pre-fills the unit cost (the product's purchase price) */
  defaultCost?: string;
  onSaved: () => void;
}) {
  const blank = (): Row => ({
    quantity: '',
    cost: defaultCost && Number(defaultCost) > 0 ? String(Number(defaultCost)) : '',
    lotNumber: '',
    expiryDate: '',
  });
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [rows, setRows] = useState<Row[]>(() => [blank()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const usedKey = usedWarehouseIds.join(',');
  useEffect(() => {
    const used = usedKey.split(',');
    listWarehouses()
      .then((all) => {
        const free = all.filter((w) => w.isActive && !used.includes(w.id));
        setWarehouses(free);
        setWarehouseId((id) => (free.some((w) => w.id === id) ? id : (free[0]?.id ?? '')));
      })
      .catch((e: Error) => setError(e.message));
  }, [usedKey]);

  if (warehouses.length === 0 && !error) return null;

  const rowValid = (r: Row) =>
    toNum(r.quantity) > 0 &&
    r.cost.trim() !== '' &&
    toNum(r.cost) >= 0 &&
    (!trackLots || r.lotNumber.trim() !== '');
  const valid = !!warehouseId && rows.length > 0 && rows.every(rowValid);
  const setRow = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <form
      className="mt-4 space-y-3 border-t border-slate-100 pt-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!valid) return;
        setBusy(true);
        setError(null);
        try {
          const r = await openingBalances({
            lines: rows.map((row) => ({
              productId,
              warehouseId,
              quantity: toNum(row.quantity),
              unitCost: toNum(row.cost),
              lotNumber: trackLots ? row.lotNumber.trim() : undefined,
              expiryDate: trackLots && row.expiryDate ? row.expiryDate : undefined,
            })),
            dryRun: false,
          });
          if (r.errors.length) setError(r.errors.map((x) => x.message).join('; '));
          else {
            setRows([blank()]);
            onSaved();
          }
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="flex items-center gap-2">
        <p className="text-sm font-medium text-slate-700">Set opening stock in</p>
        <select
          aria-label="Warehouse"
          className={clsx(inputBase, 'py-1')}
          value={warehouseId}
          onChange={(e) => setWarehouseId(e.target.value)}
        >
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.code}
            </option>
          ))}
        </select>
      </div>
      {rows.map((row, i) => (
        <div
          key={i}
          className={clsx(
            'grid gap-2',
            trackLots ? 'grid-cols-2 sm:grid-cols-[1fr_1fr_1fr_1fr_auto]' : 'grid-cols-2',
          )}
        >
          {trackLots && (
            <>
              <input
                aria-label="Lot number"
                placeholder="Lot number"
                className={clsx(inputBase, 'py-1.5')}
                value={row.lotNumber}
                onChange={(e) => setRow(i, { lotNumber: e.target.value })}
              />
              <input
                aria-label="Expiry date"
                title="Expiry date (leave empty if it does not expire)"
                type="date"
                className={clsx(inputBase, 'py-1.5')}
                value={row.expiryDate}
                onChange={(e) => setRow(i, { expiryDate: e.target.value })}
              />
            </>
          )}
          <input
            aria-label={`Quantity in ${unitCode}`}
            placeholder={`Qty (${unitCode})`}
            inputMode="decimal"
            className={clsx(inputBase, 'py-1.5')}
            value={row.quantity}
            onChange={(e) => setRow(i, { quantity: e.target.value })}
          />
          <input
            aria-label="Unit cost"
            placeholder="Unit cost"
            inputMode="decimal"
            className={clsx(inputBase, 'py-1.5')}
            value={row.cost}
            onChange={(e) => setRow(i, { cost: e.target.value })}
          />
          {trackLots && (
            <button
              type="button"
              aria-label="Remove lot"
              disabled={rows.length === 1}
              className="rounded-md p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
              onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
            >
              <Trash2 className="size-4" />
            </button>
          )}
        </div>
      ))}
      {trackLots && (
        <button
          type="button"
          className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
          onClick={() => setRows((rs) => [...rs, blank()])}
        >
          <Plus className="size-3.5" /> Add another lot
        </button>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button className={btnPrimary} disabled={!valid || busy}>
        {busy && <Loader2 className="size-4 animate-spin" />} Save opening stock
      </button>
    </form>
  );
}

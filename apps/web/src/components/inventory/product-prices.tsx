'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { Loader2, Pencil, X } from 'lucide-react';
import {
  fmtPrice,
  getProductPrices,
  setProductPrices,
  toNum,
  type ProductListPrice,
} from '@/lib/inventory';
import { btnPrimary, inputBase } from './ui';

/** Price of the product in each price list, with optional fixed prices. */
export function ProductPrices({
  productId,
  salePrice,
  unitCode,
  canWrite,
}: {
  productId: string;
  salePrice: string;
  unitCode: string;
  canWrite: boolean;
}) {
  const [prices, setPrices] = useState<ProductListPrice[] | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getProductPrices(productId)
      .then(setPrices)
      .catch((e: Error) => setError(e.message));
  }, [productId, salePrice]);

  function startEdit() {
    setDraft(
      Object.fromEntries(
        (prices ?? []).map((p) => [
          p.priceListId,
          p.fixedPrice !== null ? String(Number(p.fixedPrice)) : '',
        ]),
      ),
    );
    setEditing(true);
  }

  const invalid = Object.values(draft).some(
    (v) => v.trim() !== '' && (Number.isNaN(toNum(v)) || toNum(v) < 0),
  );

  async function save() {
    setBusy(true);
    setError(null);
    try {
      setPrices(
        await setProductPrices(
          productId,
          (prices ?? []).map((p) => ({
            priceListId: p.priceListId,
            price: draft[p.priceListId]?.trim() ? toNum(draft[p.priceListId]) : null,
          })),
        ),
      );
      setEditing(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold text-slate-900">Price lists</h2>
        {canWrite && prices && prices.length > 0 && !editing && (
          <button
            className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
            onClick={startEdit}
          >
            <Pencil className="size-3.5" /> Set fixed prices
          </button>
        )}
      </div>
      {error && <p className="mb-2 text-xs text-red-600">{error}</p>}
      {!prices ? (
        <Loader2 className="mx-auto size-5 animate-spin text-slate-400" />
      ) : (
        <table className="w-full text-sm">
          <tbody className="divide-y divide-slate-100">
            <tr>
              <td className="py-2 font-medium">Retail</td>
              <td className="py-2 text-xs text-slate-400">base sale price</td>
              <td className="py-2 text-right tabular-nums">{fmtPrice(salePrice)}</td>
            </tr>
            {prices.map((p) => (
              <tr key={p.priceListId}>
                <td className="py-2 font-medium">{p.name}</td>
                <td className="py-2 text-xs text-slate-400">
                  {p.fixedPrice !== null
                    ? 'fixed price'
                    : `rule ${Number(p.adjustmentPct) > 0 ? '+' : ''}${Number(p.adjustmentPct)} %`}
                </td>
                <td className="py-2 text-right tabular-nums">
                  {editing ? (
                    <input
                      aria-label={`Fixed price in ${p.name}`}
                      className={clsx(
                        inputBase,
                        'ml-auto block w-28 py-1 text-right',
                        draft[p.priceListId]?.trim() &&
                          Number.isNaN(toNum(draft[p.priceListId])) &&
                          'border-red-400',
                      )}
                      inputMode="decimal"
                      placeholder={fmtPrice(p.price)}
                      value={draft[p.priceListId] ?? ''}
                      onChange={(e) => setDraft((d) => ({ ...d, [p.priceListId]: e.target.value }))}
                    />
                  ) : (
                    <span className={clsx(p.fixedPrice !== null && 'font-semibold')}>
                      {fmtPrice(p.price)}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {prices && prices.length === 0 && (
        <p className="mt-2 text-xs text-slate-500">
          Only the retail price is used.{' '}
          <Link href="/inventory/products/price-lists" className="text-blue-600 hover:underline">
            Create price lists
          </Link>{' '}
          (wholesale, resellers…).
        </p>
      )}
      {editing && (
        <div className="mt-3 flex items-center justify-between gap-2">
          <p className="text-xs text-slate-500">
            Empty = use the list rule. Prices per {unitCode}, excl. VAT.
          </p>
          <div className="flex gap-2">
            <button
              aria-label="Cancel"
              className="rounded-md border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"
              onClick={() => setEditing(false)}
            >
              <X className="size-4" />
            </button>
            <button className={btnPrimary} disabled={busy || invalid} onClick={() => void save()}>
              {busy && <Loader2 className="size-4 animate-spin" />} Save
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

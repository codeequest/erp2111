'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, Tags } from 'lucide-react';
import type { ProductListPrices } from '@erp/shared';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/format';

import { tr } from '@/lib/i18n';
/** The product's price in every active price list. `version` reloads it after a save. */
export function ProductPricesCard({ productId, version }: { productId: string; version: string }) {
  const [data, setData] = useState<ProductListPrices[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<ProductListPrices[]>(`/inventory/products/${productId}/prices`)
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, [productId, version]);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Tags className="size-4 text-slate-400" /> {' '}{tr("Price lists")}</h2>
        <Link
          href="/inventory/products/price-lists"
          className="text-xs font-medium text-mod-inventory hover:underline"
        >
          {tr("Manage")}</Link>
      </div>
      {error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : !data ? (
        <Loader2 className="size-4 animate-spin text-slate-400" />
      ) : data.length === 0 ? (
        <p className="text-sm text-slate-500">
          {tr("No price lists yet. Create lists such as “Wholesale” to sell at different prices.")}</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-start text-xs text-slate-500">
            <tr>
              <th className="pb-2 font-medium">{tr("List")}</th>
              {data[0].lines.map((l) => (
                <th key={l.unit.id} className="pb-2 text-end font-medium">
                  {l.unit.code}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.map((p) => (
              <tr key={p.priceList.id}>
                <td className="py-2 text-slate-700">{p.priceList.name}</td>
                {p.lines.map((l) => (
                  <td key={l.unit.id} className="py-2 text-end tabular-nums">
                    <span className={l.fixed ? 'font-semibold text-slate-900' : 'text-slate-600'}>
                      {formatMoney(l.price)}
                    </span>
                    {l.fixed && (
                      <span className="ms-1 text-[10px] text-mod-inventory" title={tr("Own price")}>
                        ●
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {data?.some((p) => p.lines.some((l) => l.fixed)) && (
        <p className="mt-2 text-xs text-slate-400">
          <span className="text-mod-inventory">●</span> {' '}{tr("own price in that list; others follow the list’s percentage.")}</p>
      )}
    </section>
  );
}

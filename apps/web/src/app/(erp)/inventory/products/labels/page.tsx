'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import clsx from 'clsx';
import { Loader2, Minus, Plus, Printer } from 'lucide-react';
import {
  fmtMoney,
  fmtPrice,
  getProduct,
  getProductPrices,
  listPriceLists,
  listTaxRates,
  priceWithTax,
  type PriceList,
  type ProductDetail,
  type TaxRate,
} from '@/lib/inventory';
import {
  Alert,
  PageHeader,
  RequirePermission,
  btnPrimary,
  inputBase,
} from '@/components/inventory/ui';

export default function LabelsPage() {
  return (
    <RequirePermission permission="inventory.product.read">
      <Suspense>
        <Labels />
      </Suspense>
    </RequirePermission>
  );
}

/** True for a 13-digit code with a correct EAN-13 check digit. */
function isEan13(code: string) {
  if (!/^\d{13}$/.test(code)) return false;
  const digits = code.split('').map(Number);
  const sum = digits.slice(0, 12).reduce((s, d, i) => s + d * (i % 2 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === digits[12];
}

type Size = 'small' | 'medium' | 'large';
const SIZES: Record<Size, { label: string; className: string; barHeight: number }> = {
  small: { label: 'Small — 40 × 25 mm', className: 'w-[40mm] h-[25mm] text-[7pt]', barHeight: 22 },
  medium: {
    label: 'Medium — 63 × 38 mm (A4, 21 per page)',
    className: 'w-[63mm] h-[38mm] text-[9pt]',
    barHeight: 34,
  },
  large: { label: 'Large — 99 × 57 mm', className: 'w-[99mm] h-[57mm] text-[12pt]', barHeight: 50 },
};

function Labels() {
  const ids = (useSearchParams().get('ids') ?? '').split(',').filter(Boolean).slice(0, 200);
  const idsKey = ids.join(',');
  const [products, setProducts] = useState<ProductDetail[] | null>(null);
  const [rates, setRates] = useState<TaxRate[]>([]);
  const [copies, setCopies] = useState<Record<string, number>>({});
  const [size, setSize] = useState<Size>('medium');
  const [showPrice, setShowPrice] = useState(true);
  const [withTax, setWithTax] = useState(true);
  const [priceLists, setPriceLists] = useState<PriceList[]>([]);
  const [priceListId, setPriceListId] = useState('');
  /** productId → price in the chosen price list */
  const [listPrices, setListPrices] = useState<Record<string, string>>({});

  useEffect(() => {
    listPriceLists()
      .then((l) => setPriceLists(l.filter((x) => x.isActive)))
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    if (!priceListId || !idsKey) {
      setListPrices({});
      return;
    }
    Promise.all(
      idsKey.split(',').map((pid) => getProductPrices(pid).then((ps) => [pid, ps] as const)),
    )
      .then((all) =>
        setListPrices(
          Object.fromEntries(
            all.map(([pid, ps]) => [
              pid,
              ps.find((x) => x.priceListId === priceListId)?.price ?? '',
            ]),
          ),
        ),
      )
      .catch((e: Error) => setError(e.message));
  }, [priceListId, idsKey]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!idsKey) {
      setProducts([]);
      return;
    }
    Promise.all([Promise.all(idsKey.split(',').map(getProduct)), listTaxRates()])
      .then(([p, r]) => {
        setProducts(p);
        setRates(r);
        setCopies(Object.fromEntries(p.map((x) => [x.id, 1])));
      })
      .catch((e: Error) => setError(e.message));
  }, [idsKey]);

  const defaultRate = rates.find((r) => r.isDefault);
  const labels = (products ?? []).flatMap((p) =>
    Array.from({ length: copies[p.id] ?? 0 }, (_, i) => ({ key: `${p.id}-${i}`, product: p })),
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="print:hidden">
        <PageHeader
          title="Print barcode labels"
          crumbs={[{ label: 'Labels' }]}
          actions={
            <button
              className={btnPrimary}
              disabled={labels.length === 0}
              onClick={() => window.print()}
            >
              <Printer className="size-4" /> Print {labels.length} label
              {labels.length === 1 ? '' : 's'}
            </button>
          }
        />
      </div>

      {error && <Alert>{error}</Alert>}

      {!products ? (
        <Loader2 className="mx-auto mt-12 size-6 animate-spin text-slate-400" />
      ) : products.length === 0 ? (
        <Alert>No product selected. Tick products in the product list, then click “Labels”.</Alert>
      ) : (
        <>
          <div className="grid gap-4 print:hidden lg:grid-cols-[1fr_280px]">
            <div className="rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-500 uppercase">
                  <tr>
                    <th className="px-4 py-2.5">Product</th>
                    <th className="px-4 py-2.5">Code printed</th>
                    <th className="px-4 py-2.5 text-right">Copies</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {products.map((p) => (
                    <tr key={p.id}>
                      <td className="px-4 py-2">
                        <span className="font-medium">{p.name}</span>
                        <span className="ml-2 font-mono text-xs text-slate-400">{p.sku}</span>
                      </td>
                      <td className="px-4 py-2 font-mono text-xs">
                        {p.barcode ?? (
                          <span title="No barcode: the SKU is printed instead">{p.sku} (SKU)</span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            aria-label="One less"
                            className="rounded border border-slate-200 p-1 hover:bg-slate-50"
                            onClick={() =>
                              setCopies((c) => ({ ...c, [p.id]: Math.max(0, (c[p.id] ?? 0) - 1) }))
                            }
                          >
                            <Minus className="size-3.5" />
                          </button>
                          <input
                            aria-label={`Copies of ${p.name}`}
                            className={clsx(inputBase, 'w-16 py-1 text-center')}
                            inputMode="numeric"
                            value={copies[p.id] ?? 0}
                            onChange={(e) => {
                              const n = Math.min(
                                500,
                                Math.max(0, parseInt(e.target.value, 10) || 0),
                              );
                              setCopies((c) => ({ ...c, [p.id]: n }));
                            }}
                          />
                          <button
                            aria-label="One more"
                            className="rounded border border-slate-200 p-1 hover:bg-slate-50"
                            onClick={() =>
                              setCopies((c) => ({
                                ...c,
                                [p.id]: Math.min(500, (c[p.id] ?? 0) + 1),
                              }))
                            }
                          >
                            <Plus className="size-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 text-sm">
              <label className="block">
                <span className="mb-1 block font-medium text-slate-700">Label size</span>
                <select
                  className={clsx(inputBase, 'w-full')}
                  value={size}
                  onChange={(e) => setSize(e.target.value as Size)}
                >
                  {Object.entries(SIZES).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={showPrice}
                  onChange={(e) => setShowPrice(e.target.checked)}
                />
                Show the price
              </label>
              {showPrice && (
                <label className="flex items-center gap-2 pl-6">
                  <input
                    type="checkbox"
                    checked={withTax}
                    onChange={(e) => setWithTax(e.target.checked)}
                  />
                  Price including VAT
                </label>
              )}
              {showPrice && priceLists.length > 0 && (
                <label className="block pl-6">
                  <span className="mb-1 block text-slate-700">Price list</span>
                  <select
                    className={clsx(inputBase, 'w-full')}
                    value={priceListId}
                    onChange={(e) => setPriceListId(e.target.value)}
                  >
                    <option value="">Retail</option>
                    {priceLists.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <p className="text-xs text-slate-500">
                In the print dialog, set margins to “None” and scale to 100 % for exact sizes.
              </p>
            </div>
          </div>

          <p className="text-sm font-medium text-slate-500 print:hidden">Preview</p>
          <div className="print-area flex flex-wrap content-start gap-[2mm] rounded-xl border border-dashed border-slate-300 bg-white p-4 print:block print:border-0 print:p-0">
            {labels.map(({ key, product }) => {
              const rate = product.taxRate?.rate ?? defaultRate?.rate;
              const base = (priceListId && listPrices[product.id]) || product.salePrice;
              const price = withTax ? priceWithTax(base, rate) : Number(base);
              return (
                <div
                  key={key}
                  className={clsx(
                    'label flex flex-col items-center justify-between overflow-hidden rounded border border-slate-300 bg-white p-[1.5mm] text-center text-black print:float-left print:rounded-none print:border-slate-200',
                    SIZES[size].className,
                  )}
                >
                  <p className="line-clamp-2 w-full leading-tight font-semibold">{product.name}</p>
                  <Barcode value={product.barcode ?? product.sku} height={SIZES[size].barHeight} />
                  {showPrice && (
                    <p className="leading-none font-bold">
                      {fmtPrice(price)}
                      <span className="ml-1 text-[0.7em] font-normal">
                        {withTax ? 'incl. VAT' : 'excl. VAT'} / {product.baseUnit.code}
                      </span>
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function Barcode({ value, height }: { value: string; height: number }) {
  const ref = useRef<SVGSVGElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    import('jsbarcode').then(({ default: JsBarcode }) => {
      if (cancelled || !ref.current) return;
      try {
        JsBarcode(ref.current, value, {
          format: isEan13(value) ? 'EAN13' : 'CODE128',
          height,
          width: 1.4,
          fontSize: 11,
          margin: 0,
          background: 'transparent',
        });
        setFailed(false);
      } catch {
        setFailed(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [value, height]);
  if (failed) return <p className="font-mono">{value}</p>;
  return (
    <svg ref={ref} className="max-h-full max-w-full" role="img" aria-label={`Barcode ${value}`} />
  );
}

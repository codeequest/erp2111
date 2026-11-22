'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import clsx from 'clsx';
import { AlertTriangle, Loader2, Pencil, Power, PowerOff } from 'lucide-react';
import type { ProductDetail } from '@erp/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDateTime, formatMoney, formatQty } from '@/lib/format';
import {
  Breadcrumbs,
  ErrorBox,
  StatusBadge,
  btnPrimary,
  btnSecondary,
} from '@/components/products/ui';
import { PackUnitsCard } from '@/components/products/pack-units-card';
import { ProductImageCard } from '@/components/products/product-image-card';
import { ProductHistoryCard } from '@/components/products/product-history-card';
import { ProductPricesCard } from '@/components/products/product-prices-card';

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const canWrite = can('inventory.product.write');

  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<ProductDetail>(`/inventory/products/${id}`)
      .then(setProduct)
      .catch((e: Error) => setError(e.message));
  }, [id]);

  async function toggleActive() {
    if (!product) return;
    setBusy(true);
    setError(null);
    try {
      const action = product.isActive ? 'deactivate' : 'activate';
      setProduct(
        await api<ProductDetail>(`/inventory/products/${id}/${action}`, { method: 'POST' }),
      );
      setConfirming(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!product) {
    return (
      <div className="mx-auto max-w-5xl space-y-6">
        <Breadcrumbs trail={[{ label: 'Products', href: '/inventory/products' }]} />
        {error ? (
          <ErrorBox message={error} />
        ) : (
          <Loader2 className="mx-auto size-6 animate-spin text-slate-400" />
        )}
      </div>
    );
  }

  const low =
    Number(product.minStock) > 0 && Number(product.stockOnHand) < Number(product.minStock);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <Breadcrumbs
          trail={[{ label: 'Products', href: '/inventory/products' }, { label: product.name }]}
        />
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold text-slate-900">{product.name}</h1>
              <StatusBadge active={product.isActive} />
            </div>
            <p className="mt-1 font-mono text-sm text-slate-500">
              {product.sku}
              {product.barcode && <span className="ml-3">· {product.barcode}</span>}
            </p>
          </div>
          {canWrite && (
            <div className="flex flex-wrap gap-2">
              {confirming ? (
                <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm text-amber-800">
                  {product.isActive
                    ? 'Hide this product from new orders?'
                    : 'Make this product available again?'}
                  <button
                    onClick={toggleActive}
                    disabled={busy}
                    className="rounded bg-amber-600 px-2 py-1 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                  >
                    {busy ? 'Saving…' : 'Yes'}
                  </button>
                  <button
                    onClick={() => setConfirming(false)}
                    className="rounded px-2 py-1 text-xs hover:bg-amber-100"
                  >
                    No
                  </button>
                </div>
              ) : (
                <button onClick={() => setConfirming(true)} className={btnSecondary}>
                  {product.isActive ? (
                    <>
                      <PowerOff className="size-4" /> Deactivate
                    </>
                  ) : (
                    <>
                      <Power className="size-4" /> Activate
                    </>
                  )}
                </button>
              )}
              <Link href={`/inventory/products/${id}/edit`} className={btnPrimary}>
                <Pencil className="size-4" /> Edit
              </Link>
            </div>
          )}
        </div>
      </div>

      {error && <ErrorBox message={error} />}

      {!product.isActive && (
        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
          This product is inactive: it is hidden from new sales and purchase orders but kept in
          history.
        </div>
      )}

      {/* Key figures */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Sale price" value={formatMoney(product.salePrice)} />
        {product.averageCost !== undefined && (
          <Stat label="Average cost" value={formatMoney(product.averageCost)} />
        )}
        <Stat
          label="On hand"
          value={`${formatQty(product.stockOnHand)} ${product.baseUnit.code}`}
          warn={low ? `Below minimum (${formatQty(product.minStock)})` : undefined}
        />
        <Stat
          label="Minimum stock"
          value={Number(product.minStock) > 0 ? formatQty(product.minStock) : 'Off'}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-1">
          <ProductImageCard product={product} canWrite={canWrite} onSaved={setProduct} />

          {/* Details */}
          <Card title="Details">
            <dl className="space-y-3 text-sm">
              <Row label="Category" value={product.category?.name} />
              <Row
                label="Base unit"
                value={`${product.baseUnit.code} — ${product.baseUnit.name}`}
              />
              <Row
                label="Tax rate"
                value={
                  product.taxRate
                    ? `${product.taxRate.name} (${product.taxRate.rate}%)`
                    : 'Company default'
                }
              />
              <Row label="Description" value={product.description} />
              <Row label="Created" value={formatDateTime(product.createdAt)} />
              <Row label="Last updated" value={formatDateTime(product.updatedAt)} />
            </dl>
          </Card>
        </div>

        <div className="space-y-6 lg:col-span-2">
          <PackUnitsCard product={product} canWrite={canWrite} onSaved={setProduct} />
          <ProductPricesCard
            productId={product.id}
            version={`${product.updatedAt}|${JSON.stringify(product.packUnits)}`}
          />

          {/* Stock by warehouse */}
          <Card title="Stock by warehouse">
            {product.stockByWarehouse.length === 0 ? (
              <p className="text-sm text-slate-500">
                No stock yet. Stock arrives through goods receipts and adjustments.
              </p>
            ) : (
              <table className="w-full text-sm">
                <tbody className="divide-y divide-slate-100">
                  {product.stockByWarehouse.map((s) => (
                    <tr key={s.warehouse.id}>
                      <td className="py-2">
                        <span className="font-mono text-xs text-slate-500">{s.warehouse.code}</span>{' '}
                        {s.warehouse.name}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {formatQty(s.quantity)} {product.baseUnit.code}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          {/* Recent movements */}
          {product.recentMoves && (
            <Card title="Recent stock movements">
              {product.recentMoves.length === 0 ? (
                <p className="text-sm text-slate-500">No movements yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs text-slate-500 uppercase">
                      <tr>
                        <th className="py-2 pr-3 font-medium">Date</th>
                        <th className="py-2 pr-3 font-medium">Type</th>
                        <th className="py-2 pr-3 font-medium">Warehouse</th>
                        <th className="py-2 pr-3 font-medium">Reference</th>
                        <th className="py-2 text-right font-medium">Qty</th>
                        {product.averageCost !== undefined && (
                          <th className="py-2 pl-3 text-right font-medium">Unit cost</th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {product.recentMoves.map((m) => (
                        <tr key={m.id}>
                          <td className="py-2 pr-3 whitespace-nowrap text-slate-600">
                            {formatDateTime(m.createdAt)}
                          </td>
                          <td className="py-2 pr-3">{m.type.replaceAll('_', ' ').toLowerCase()}</td>
                          <td className="py-2 pr-3 font-mono text-xs">{m.warehouse.code}</td>
                          <td className="py-2 pr-3 text-slate-600">
                            {m.reference ?? m.reason ?? '—'}
                          </td>
                          <td
                            className={clsx(
                              'py-2 text-right tabular-nums',
                              Number(m.quantity) < 0 ? 'text-red-600' : 'text-emerald-700',
                            )}
                          >
                            {Number(m.quantity) > 0 ? '+' : ''}
                            {formatQty(m.quantity)}
                          </td>
                          {product.averageCost !== undefined && (
                            <td className="py-2 pl-3 text-right tabular-nums">
                              {formatMoney(m.unitCost)}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}

          <ProductHistoryCard
            productId={product.id}
            version={`${product.updatedAt}|${JSON.stringify(product.packUnits)}`}
          />
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p
        className={clsx(
          'mt-1 text-xl font-semibold tabular-nums',
          warn ? 'text-amber-600' : 'text-slate-900',
        )}
      >
        {value}
      </p>
      {warn && (
        <p className="mt-1 flex items-center gap-1 text-xs text-amber-600">
          <AlertTriangle className="size-3" /> {warn}
        </p>
      )}
    </div>
  );
}

function Card({
  title,
  className,
  children,
}: {
  title: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={clsx('rounded-xl border border-slate-200 bg-white p-5', className)}>
      <h2 className="mb-3 text-sm font-semibold text-slate-900">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-line text-slate-900">{value || '—'}</dd>
    </div>
  );
}

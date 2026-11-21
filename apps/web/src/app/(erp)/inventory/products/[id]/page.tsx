'use client';

import Link from 'next/link';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import clsx from 'clsx';
import { CheckCircle2, Loader2, Power, RotateCcw } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { ApiRequestError } from '@/lib/api';
import {
  inventoryApi,
  money,
  qty,
  type ProductDetail,
  type ProductFormOptions,
} from '@/lib/inventory';
import {
  AccessDenied,
  Breadcrumb,
  Card,
  ErrorNotice,
  StatusPill,
  StockBadge,
  btn,
} from '@/components/inventory/ui';
import { ProductForm } from '@/components/inventory/product-form';

const MOVE_LABELS: Record<string, string> = {
  OPENING: 'Opening',
  RECEIPT: 'Receipt',
  DELIVERY: 'Delivery',
  ADJUSTMENT: 'Adjustment',
  TRANSFER_IN: 'Transfer in',
  TRANSFER_OUT: 'Transfer out',
  CUSTOMER_RETURN: 'Customer return',
};

export default function ProductPage() {
  return (
    <Suspense fallback={null}>
      <ProductDetailView />
    </Suspense>
  );
}

function ProductDetailView() {
  const { id } = useParams<{ id: string }>();
  const created = useSearchParams().get('created') === '1';
  const { can } = useAuth();
  const canRead = can('inventory.product.read');
  const canWrite = can('inventory.product.write');
  const canSeeStock = can('inventory.stock.read');

  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [options, setOptions] = useState<ProductFormOptions | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showCreated, setShowCreated] = useState(created);

  const load = useCallback(async () => {
    try {
      const [p, o] = await Promise.all([inventoryApi.getProduct(id), inventoryApi.formOptions()]);
      setProduct(p);
      setOptions(o);
    } catch (e) {
      if (e instanceof ApiRequestError && (e.status === 404 || e.status === 400)) setNotFound(true);
      else setError((e as Error).message);
    }
  }, [id]);

  useEffect(() => {
    if (canRead) void load();
  }, [canRead, load]);

  if (!canRead) return <AccessDenied permission="inventory.product.read" what="open Products" />;

  if (notFound) {
    return (
      <div className="mx-auto mt-16 max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center">
        <h1 className="text-lg font-semibold text-slate-900">Product not found</h1>
        <p className="mt-1 text-sm text-slate-500">
          It may have been removed, or the link is wrong.
        </p>
        <Link
          href="/inventory/products"
          className="mt-5 inline-block text-sm font-medium text-blue-600 hover:underline"
        >
          Back to products
        </Link>
      </div>
    );
  }

  const toggleActive = async () => {
    if (!product) return;
    if (
      product.isActive &&
      !confirm(`Deactivate "${product.name}"? It will be hidden from new documents.`)
    )
      return;
    setBusy(true);
    try {
      setProduct(await inventoryApi.setActive(product.id, !product.isActive));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <Breadcrumb
          items={[
            { label: 'Inventory' },
            { label: 'Products', href: '/inventory/products' },
            { label: product?.sku ?? '…' },
          ]}
        />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold text-slate-900">
              <span className="truncate">{product?.name ?? 'Loading…'}</span>
              {product && <StatusPill active={product.isActive} />}
              {product && <StockBadge status={product.stockStatus} />}
            </h1>
            {product && (
              <p className="font-mono text-sm text-slate-500">
                {product.sku}
                {product.category && <span className="font-sans"> · {product.category.path}</span>}
              </p>
            )}
          </div>
          {product && canWrite && (
            <button
              onClick={toggleActive}
              disabled={busy}
              className={product.isActive ? btn.danger : btn.secondary}
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : product.isActive ? (
                <Power className="size-4" />
              ) : (
                <RotateCcw className="size-4" />
              )}
              {product.isActive ? 'Deactivate' : 'Re-activate'}
            </button>
          )}
        </div>
      </div>

      {showCreated && (
        <div className="flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          <CheckCircle2 className="size-4" />
          <p className="flex-1">Product created.</p>
          <Link href="/inventory/products/new" className="font-medium hover:underline">
            Add another
          </Link>
          <button
            onClick={() => setShowCreated(false)}
            className="ml-2 text-emerald-700 hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}
      {error && <ErrorNotice message={error} onClose={() => setError(null)} />}

      {!product || !options ? (
        !error && (
          <div className="grid place-items-center py-20 text-slate-400">
            <Loader2 className="size-6 animate-spin" />
          </div>
        )
      ) : (
        <>
          {/* Stock overview */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="On hand"
              value={`${qty(product.onHand)} ${product.baseUnit.code}`}
              highlight={product.stockStatus}
            />
            <Stat
              label="Minimum stock"
              value={`${qty(product.minStock)} ${product.baseUnit.code}`}
            />
            <Stat label="Price incl. VAT" value={money(product.salePriceInclTax)} />
            {product.averageCost !== undefined ? (
              <Stat label="Average cost" value={money(product.averageCost)} />
            ) : (
              <Stat label="Price excl. VAT" value={money(product.salePrice)} />
            )}
          </div>

          <ProductForm
            key={product.id}
            product={product}
            options={options}
            onOptionsChange={setOptions}
            onSaved={setProduct}
          />

          {canSeeStock && (
            <div className="grid gap-6 lg:grid-cols-3">
              <Card title="Stock by warehouse" className="lg:col-span-1">
                {product.stockByWarehouse.length === 0 ? (
                  <p className="text-sm text-slate-500">No stock recorded yet.</p>
                ) : (
                  <ul className="divide-y divide-slate-100 text-sm">
                    {product.stockByWarehouse.map((s) => (
                      <li key={s.warehouse.id} className="flex justify-between py-2">
                        <span className="text-slate-700">
                          <span className="font-mono text-xs text-slate-500">
                            {s.warehouse.code}
                          </span>{' '}
                          {s.warehouse.name}
                        </span>
                        <span className="font-medium tabular-nums text-slate-900">
                          {qty(s.quantity)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
              <Card
                title="Recent stock moves"
                description="Last 10 movements"
                className="lg:col-span-2"
              >
                {product.recentMoves.length === 0 ? (
                  <p className="text-sm text-slate-500">No movement yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[480px] text-sm">
                      <thead>
                        <tr className="text-left text-xs text-slate-500">
                          <th className="pb-2 font-medium">Date</th>
                          <th className="pb-2 font-medium">Type</th>
                          <th className="pb-2 font-medium">Warehouse</th>
                          <th className="pb-2 font-medium">Reference</th>
                          <th className="pb-2 text-right font-medium">Qty</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {product.recentMoves.map((m) => (
                          <tr key={m.id}>
                            <td className="py-2 text-slate-600">
                              {new Date(m.createdAt).toLocaleDateString()}
                            </td>
                            <td className="py-2 text-slate-700">{MOVE_LABELS[m.type] ?? m.type}</td>
                            <td className="py-2 font-mono text-xs text-slate-600">{m.warehouse}</td>
                            <td className="py-2 text-slate-600">{m.reference ?? '—'}</td>
                            <td
                              className={clsx(
                                'py-2 text-right font-medium tabular-nums',
                                Number(m.quantity) < 0 ? 'text-red-600' : 'text-emerald-700',
                              )}
                            >
                              {Number(m.quantity) > 0 ? '+' : ''}
                              {qty(m.quantity)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: 'ok' | 'low' | 'out';
}) {
  return (
    <div
      className={clsx(
        'rounded-xl border bg-white p-4',
        highlight === 'low'
          ? 'border-amber-300'
          : highlight === 'out'
            ? 'border-red-300'
            : 'border-slate-200',
      )}
    >
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{value}</p>
    </div>
  );
}

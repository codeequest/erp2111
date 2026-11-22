'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, History, Loader2, Power, PowerOff } from 'lucide-react';
import type { ProductDetail } from '@erp/shared';
import { api, ApiRequestError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatAmount, formatQty } from '@/lib/format';
import { AccessDenied, Breadcrumbs, StatusBadge } from '@/components/page-header';
import { ProductForm } from '@/components/product-form';

export default function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { can } = useAuth();
  const canRead = can('inventory.product.read');
  const canWrite = can('inventory.product.write');
  const canViewCost = can('inventory.cost.view');
  const canReadStock = can('inventory.stock.read');

  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [error, setError] = useState<{ status: number; message: string } | null>(null);
  const [toggling, setToggling] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    // Read once, on mount: shows "created" after being redirected from the New page.
    if (new URLSearchParams(window.location.search).get('created')) {
      setNotice('Product created.');
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (!canRead) return;
    api<ProductDetail>(`/inventory/products/${id}`)
      .then(setProduct)
      .catch((e: Error) =>
        setError({ status: e instanceof ApiRequestError ? e.status : 0, message: e.message }),
      );
  }, [id, canRead]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  if (!canRead) return <AccessDenied permission="inventory.product.read" what="Products" />;

  if (error) {
    return (
      <div className="mx-auto mt-16 max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center">
        <h1 className="text-lg font-semibold text-slate-900">
          {error.status === 404 || error.status === 400 ? 'Product not found' : 'Could not load'}
        </h1>
        <p className="mt-1 text-sm text-slate-500">{error.message}</p>
        <Link
          href="/inventory/products"
          className="mt-5 inline-block text-sm font-medium text-blue-600 hover:underline"
        >
          Back to products
        </Link>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="size-6 animate-spin text-slate-400" />
      </div>
    );
  }

  async function toggleActive() {
    if (!product) return;
    if (
      product.isActive &&
      !window.confirm(
        `Deactivate "${product.name}"? It will be hidden from new orders but kept in history.`,
      )
    ) {
      return;
    }
    setToggling(true);
    try {
      const updated = await api<ProductDetail>(
        `/inventory/products/${product.id}/${product.isActive ? 'deactivate' : 'activate'}`,
        { method: 'POST' },
      );
      setProduct(updated);
      setNotice(updated.isActive ? 'Product re-activated.' : 'Product deactivated.');
    } catch (e) {
      setNotice(null);
      window.alert((e as Error).message);
    } finally {
      setToggling(false);
    }
  }

  const low = Number(product.minStock) > 0 && Number(product.onHand) < Number(product.minStock);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Breadcrumbs
          items={[
            { label: 'Home', href: '/dashboard' },
            { label: 'Inventory' },
            { label: 'Products', href: '/inventory/products' },
            { label: product.sku },
          ]}
        />
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold text-slate-900">{product.name}</h1>
              <StatusBadge active={product.isActive} />
            </div>
            <p className="mt-0.5 font-mono text-sm text-slate-500">{product.sku}</p>
          </div>
          {canWrite && (
            <button
              onClick={toggleActive}
              disabled={toggling}
              className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              {toggling ? (
                <Loader2 className="size-4 animate-spin" />
              ) : product.isActive ? (
                <PowerOff className="size-4" />
              ) : (
                <Power className="size-4" />
              )}
              {product.isActive ? 'Deactivate' : 'Re-activate'}
            </button>
          )}
        </div>
      </div>

      {notice && (
        <p
          role="status"
          className="flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
        >
          <CheckCircle2 className="size-4" /> {notice}
        </p>
      )}

      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat
          label="On hand"
          value={`${formatQty(product.onHand)} ${product.baseUnit.code}`}
          warn={low}
          hint={low ? `Below minimum (${formatQty(product.minStock)})` : undefined}
        />
        <Stat label="Sale price" value={formatAmount(product.salePrice)} />
        {canViewCost && <Stat label="Average cost" value={formatAmount(product.averageCost, 4)} />}
        <Stat label="Last updated" value={new Date(product.updatedAt).toLocaleDateString()} />
      </dl>

      {canReadStock && (
        <Link
          href={`/inventory/stock?tab=moves&productId=${product.id}&product=${encodeURIComponent(`${product.sku} — ${product.name}`)}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:underline"
        >
          <History className="size-4" /> View stock movements
        </Link>
      )}

      <ProductForm
        product={product}
        readOnly={!canWrite}
        onSaved={(p) => {
          setProduct(p);
          setNotice('Changes saved.');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  warn,
  hint,
}: {
  label: string;
  value: string;
  warn?: boolean;
  hint?: string;
}) {
  return (
    <div
      className={`rounded-xl border bg-white p-4 ${warn ? 'border-amber-300' : 'border-slate-200'}`}
    >
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd
        className={`mt-1 text-lg font-semibold tabular-nums ${warn ? 'text-amber-700' : 'text-slate-900'}`}
      >
        {value}
      </dd>
      {hint && <p className="mt-0.5 text-xs text-amber-700">{hint}</p>}
    </div>
  );
}

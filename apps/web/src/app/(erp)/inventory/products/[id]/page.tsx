'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import clsx from 'clsx';
import { Boxes, Coins, Loader2, Power } from 'lucide-react';
import type { ProductDetail } from '@erp/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDecimal, isBelow } from '@/lib/inventory';
import { useApiData } from '@/lib/use-api-data';
import { ProductForm } from '@/components/inventory/product-form';
import { ProductHeader } from '@/components/inventory/product-header';
import { AccessDenied, ErrorBanner, SkeletonRows, Toast } from '@/components/ui';

export default function ProductPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { can } = useAuth();
  const canRead = can('inventory.product.read');
  const canWrite = can('inventory.product.write');

  const { data, error, loading, reload } = useApiData<ProductDetail>(
    canRead ? `/inventory/products/${id}` : null,
  );
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const clearToast = useCallback(() => setToast(null), []);

  useEffect(() => setProduct(data), [data]);

  // Arriving from "New product": confirm, then clean the URL.
  useEffect(() => {
    if (searchParams.get('created')) {
      setToast('Product created');
      router.replace(`/inventory/products/${id}`, { scroll: false });
    }
  }, [searchParams, router, id]);

  async function toggleActive() {
    if (!product) return;
    setBusy(true);
    setActionError(null);
    try {
      const saved = product.isActive
        ? await api<ProductDetail>(`/inventory/products/${id}/deactivate`, { method: 'POST' })
        : await api<ProductDetail>(`/inventory/products/${id}`, {
            method: 'PATCH',
            body: JSON.stringify({ isActive: true }),
          });
      setProduct(saved);
      setToast(saved.isActive ? 'Product reactivated' : 'Product deactivated');
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not update the product');
    } finally {
      setBusy(false);
    }
  }

  if (!canRead) return <AccessDenied permission="inventory.product.read" what="products" />;

  if (!product) {
    return (
      <div className="mx-auto max-w-4xl space-y-5">
        {error ? (
          <ErrorBanner message={error} onRetry={reload} />
        ) : (
          loading && (
            <div className="rounded-xl border border-slate-200 bg-white">
              <SkeletonRows rows={6} />
            </div>
          )
        )}
      </div>
    );
  }

  const low = isBelow(product.onHand, product.minStock);

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <ProductHeader
        title={product.name}
        subtitle={product.sku}
        monoSubtitle
        badge={
          !product.isActive && (
            <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-medium ring-1 ring-white/30">
              Inactive
            </span>
          )
        }
        actions={
          canWrite && (
            <button
              onClick={toggleActive}
              disabled={busy}
              className={clsx(
                'inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium ring-1 backdrop-blur transition-all active:scale-[0.98] disabled:opacity-60',
                product.isActive
                  ? 'bg-white/10 text-white ring-white/30 hover:bg-red-500/80 hover:ring-red-300'
                  : 'bg-white text-mod-inventory ring-white hover:bg-emerald-50',
              )}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Power className="size-4" />}
              {product.isActive ? 'Deactivate' : 'Reactivate'}
            </button>
          )
        }
      />

      {actionError && <ErrorBanner message={actionError} />}

      {(product.onHand !== undefined || product.averageCost !== undefined) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {product.onHand !== undefined && (
            <Stat
              icon={Boxes}
              label="On hand, all warehouses"
              value={`${formatDecimal(product.onHand)} ${product.baseUnit.code}`}
              note={
                low
                  ? `Below the minimum of ${formatDecimal(product.minStock)}`
                  : 'Changes only through receipts, deliveries and adjustments'
              }
              warn={low}
            />
          )}
          {product.averageCost !== undefined && (
            <Stat
              icon={Coins}
              label="Weighted average cost"
              value={formatDecimal(product.averageCost, 2)}
              note="Updated automatically by goods receipts"
            />
          )}
        </div>
      )}

      <ProductForm
        key={formKey}
        product={product}
        readOnly={!canWrite}
        cancelHref="/inventory/products"
        onSaved={(saved) => {
          setProduct(saved);
          setFormKey((k) => k + 1);
          setToast('Changes saved');
        }}
      />

      <Toast message={toast} onDone={clearToast} />
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  note,
  warn,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  note: string;
  warn?: boolean;
}) {
  return (
    <div
      className={clsx(
        'animate-fade-up flex items-center gap-4 rounded-xl border bg-white p-4 shadow-xs',
        warn ? 'border-amber-200' : 'border-slate-200',
      )}
    >
      <div
        className={clsx(
          'grid size-11 place-items-center rounded-xl ring-1',
          warn
            ? 'bg-amber-50 text-amber-600 ring-amber-200'
            : 'bg-gradient-to-br from-emerald-50 to-teal-100 text-mod-inventory ring-emerald-200/60',
        )}
      >
        <Icon className="size-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <p className="text-lg font-semibold text-slate-900 tabular-nums">{value}</p>
        <p className={clsx('truncate text-xs', warn ? 'text-amber-700' : 'text-slate-400')}>
          {note}
        </p>
      </div>
    </div>
  );
}

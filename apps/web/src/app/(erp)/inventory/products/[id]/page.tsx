'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import clsx from 'clsx';
import {
  AlertTriangle,
  ArchiveRestore,
  Archive,
  Loader2,
  Pencil,
  PackageX,
  Warehouse,
} from 'lucide-react';
import type { ProductDetail } from '@erp/shared';
import { ApiRequestError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import {
  LIST_EDITED_KEY,
  LIST_RETURN_KEY,
  TRACKING_LABELS,
  formatAmount,
  formatQty,
  inventoryApi,
} from '@/lib/inventory';
import { ProductPhoto } from '@/components/inventory/product-photo';

const RETURN_KEY = LIST_RETURN_KEY;
const EDITED_KEY = LIST_EDITED_KEY;
import {
  ProductsHeader,
  StatusBadge,
  primaryBtn,
  secondaryBtn,
} from '@/components/inventory/products-header';
import { ProductForm } from '@/components/inventory/product-form';

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { can } = useAuth();
  const canWrite = can('inventory.product.write');
  const canCost = can('inventory.cost.view');

  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [error, setError] = useState<{ status?: number; message: string } | null>(null);
  const [editing, setEditing] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);

  /** Set when the user clicked "Edit" in the list: Save / Cancel go back there. */
  const [returnTo, setReturnTo] = useState<string | null>(null);

  // Address parameters: ?warning=… from the "New product" page (e.g. the photo failed
  // after saving), ?edit=1 from the list's Edit button.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const w = params.get('warning');
    if (w) setWarning(w);
    if (params.get('edit') === '1' && canWrite) {
      setEditing(true);
      let back: string | null = null;
      try {
        back = sessionStorage.getItem(RETURN_KEY);
        sessionStorage.removeItem(RETURN_KEY);
      } catch {
        /* ignore */
      }
      setReturnTo(back ?? '/inventory/products');
    }
    if (w || params.has('edit')) window.history.replaceState(null, '', window.location.pathname);
  }, [canWrite]);

  const load = useCallback(() => {
    setError(null);
    inventoryApi
      .getProduct(id)
      .then(setProduct)
      .catch((e: Error) =>
        setError({
          status: e instanceof ApiRequestError ? e.status : undefined,
          message: e.message,
        }),
      );
  }, [id]);

  useEffect(load, [load]);

  async function toggleActive() {
    if (!product) return;
    setToggling(true);
    try {
      setProduct(await inventoryApi.setProductActive(product.id, !product.isActive));
      setConfirmDeactivate(false);
    } catch (e) {
      setError({ message: (e as Error).message });
    } finally {
      setToggling(false);
    }
  }

  if (error && !product) {
    return (
      <div className="animate-fade-in-up mx-auto mt-16 max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <PackageX className="mx-auto size-9 text-slate-400" />
        <h1 className="mt-3 text-lg font-semibold text-slate-900">
          {error.status === 404 ? 'Product not found' : 'Could not load this product'}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {error.status === 404 ? 'It may have been removed, or the link is wrong.' : error.message}
        </p>
        <Link href="/inventory/products" className={clsx(secondaryBtn, 'mt-5')}>
          Back to products
        </Link>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="grid h-64 place-items-center text-slate-400">
        <Loader2 className="size-6 animate-spin" />
      </div>
    );
  }

  if (editing) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <ProductsHeader
          title={`Edit ${product.name}`}
          subtitle={<span className="font-mono">{product.sku}</span>}
          crumbs={[
            { label: product.sku, href: `/inventory/products/${product.id}` },
            { label: 'Edit' },
          ]}
        />
        <ProductForm
          product={product}
          submitLabel="Save changes"
          onSubmit={(input) => inventoryApi.updateProduct(product.id, input)}
          onSaved={(p, w) => {
            setProduct(p);
            setWarning(w ?? null);
            setEditing(false);
            // Opened from the list and all went well: go back to the same list page.
            if (returnTo && !w) {
              try {
                sessionStorage.setItem(EDITED_KEY, p.id);
              } catch {
                /* ignore */
              }
              router.push(returnTo);
            }
            setReturnTo(null);
          }}
          onCancel={() => {
            setEditing(false);
            if (returnTo) router.push(returnTo);
            setReturnTo(null);
          }}
        />
      </div>
    );
  }

  const totalOnHand = formatQty(product.onHand);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <ProductsHeader
        title={product.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{product.sku}</span>
            <StatusBadge active={product.isActive} />
          </span>
        }
        crumbs={[{ label: product.sku }]}
        actions={
          canWrite && (
            <>
              {product.isActive ? (
                <button
                  onClick={() => setConfirmDeactivate(true)}
                  className={secondaryBtn}
                  disabled={toggling}
                >
                  <Archive className="size-4" /> Deactivate
                </button>
              ) : (
                <button onClick={toggleActive} className={secondaryBtn} disabled={toggling}>
                  {toggling ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <ArchiveRestore className="size-4" />
                  )}
                  Reactivate
                </button>
              )}
              <button onClick={() => setEditing(true)} className={primaryBtn}>
                <Pencil className="size-4" /> Edit
              </button>
            </>
          )
        }
      />

      {error && (
        <div
          className="animate-shake rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"
          role="alert"
        >
          {error.message}
        </div>
      )}

      {warning && (
        <div
          className="animate-fade-in-up flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"
          role="status"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span className="flex-1">{warning}</span>
          <button onClick={() => setWarning(null)} className="text-amber-600 hover:text-amber-900">
            Dismiss
          </button>
        </div>
      )}

      {!product.isActive && (
        <div className="animate-fade-in-up flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-100 p-3 text-sm text-slate-600">
          <Archive className="mt-0.5 size-4 shrink-0" />
          This product is inactive: it stays in history and reports but cannot be picked on new
          purchase or sales documents.
        </div>
      )}

      {/* Key figures */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat
          label="Sale price"
          value={formatAmount(product.salePrice)}
          hint={`per ${product.baseUnit.code}, before tax`}
          delay={0}
        />
        {canCost && (
          <Stat
            label="Average cost"
            value={formatAmount(product.averageCost)}
            hint="from goods receipts"
            delay={50}
          />
        )}
        <Stat
          label="On hand"
          value={totalOnHand}
          hint={`${product.baseUnit.code} · all warehouses`}
          tone={product.onHand.startsWith('-') ? 'danger' : product.isLowStock ? 'warn' : undefined}
          delay={100}
        />
        <Stat
          label="Low-stock alert"
          value={Number(product.minStock) > 0 ? formatQty(product.minStock) : 'Off'}
          hint={Number(product.minStock) > 0 ? 'warns below this quantity' : 'no alert set'}
          delay={150}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Details */}
        <section
          className="animate-fade-in-up rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2"
          style={{ animationDelay: '120ms' }}
        >
          <div className="flex flex-col gap-5 sm:flex-row">
            <ProductPhoto
              url={product.photoUrl}
              alt={product.name}
              className="mx-auto size-40 rounded-2xl ring-1 ring-slate-200 sm:mx-0"
              iconClassName="size-12"
            />
            <dl className="grid flex-1 grid-cols-1 gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
              <Item label="Code" value={<span className="font-mono">{product.sku}</span>} />
              <Item
                label="Barcode"
                value={product.barcode && <span className="font-mono">{product.barcode}</span>}
              />
              <Item label="Category" value={product.category?.name} />
              <Item label="Counted in" value={product.baseUnit.code} />
              <Item
                label="Followed by"
                value={
                  <span className="inline-flex items-center gap-1.5">
                    {product.tracking !== 'NONE' && (
                      <span className="size-1.5 rounded-full bg-sky-500" />
                    )}
                    {TRACKING_LABELS[product.tracking].label}
                  </span>
                }
              />
              <Item
                label="Tax rate"
                value={
                  product.taxRate
                    ? `${product.taxRate.name} (${product.taxRate.rate}%)`
                    : 'Company default'
                }
              />
              <Item label="Description" value={product.description} wide />
              <Item label="Created" value={new Date(product.createdAt).toLocaleString()} />
              <Item label="Last updated" value={new Date(product.updatedAt).toLocaleString()} />
            </dl>
          </div>
        </section>

        {/* Stock per warehouse */}
        <section
          className="animate-fade-in-up rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
          style={{ animationDelay: '180ms' }}
        >
          <h2 className="text-sm font-semibold tracking-wide text-slate-500 uppercase">
            Stock by warehouse
          </h2>
          {product.stock.length === 0 ? (
            <div className="mt-6 flex flex-col items-center pb-4 text-center">
              <div className="grid size-11 place-items-center rounded-xl bg-gradient-to-br from-emerald-50 to-teal-100">
                <Warehouse className="size-5 text-emerald-600" />
              </div>
              <p className="mt-3 text-sm text-slate-500">
                No stock yet. It appears here after the first goods receipt or opening balance.
              </p>
            </div>
          ) : (
            <ul className="mt-3 divide-y divide-slate-100">
              {product.stock.map((s) => (
                <li
                  key={s.warehouse.id}
                  className="flex items-center justify-between py-2.5 text-sm"
                >
                  <span>
                    <span className="font-medium text-slate-800">{s.warehouse.name}</span>{' '}
                    <span className="font-mono text-xs text-slate-400">{s.warehouse.code}</span>
                  </span>
                  <span className="tabular-nums">
                    {formatQty(s.quantity)}{' '}
                    <span className="text-xs text-slate-400">{product.baseUnit.code}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Deactivate confirmation */}
      {confirmDeactivate && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4 backdrop-blur-sm"
          onClick={() => !toggling && setConfirmDeactivate(false)}
        >
          <div
            className="animate-pop w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="grid size-10 shrink-0 place-items-center rounded-full bg-amber-50">
                <AlertTriangle className="size-5 text-amber-500" />
              </div>
              <div>
                <h2 className="font-semibold text-slate-900">Deactivate {product.name}?</h2>
                <p className="mt-1 text-sm text-slate-500">
                  It will no longer be offered on new purchase and sales documents. History, stock
                  and reports are kept, and you can reactivate it at any time.
                </p>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setConfirmDeactivate(false)}
                className={secondaryBtn}
                disabled={toggling}
              >
                Cancel
              </button>
              <button
                onClick={toggleActive}
                disabled={toggling}
                className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:shadow-md disabled:opacity-60"
              >
                {toggling && <Loader2 className="size-4 animate-spin" />} Deactivate
              </button>
            </div>
          </div>
        </div>
      )}

      <button
        onClick={() => router.push('/inventory/products')}
        className="text-sm text-slate-500 hover:text-slate-800"
      >
        ← Back to products
      </button>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
  delay,
}: {
  label: string;
  value: string;
  hint: string;
  /** warn = below the minimum (amber), danger = negative stock (red) */
  tone?: 'warn' | 'danger';
  delay: number;
}) {
  return (
    <div
      className={clsx(
        'animate-fade-in-up rounded-xl border bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md',
        tone === 'warn' && 'border-amber-200 bg-gradient-to-br from-white to-amber-50',
        tone === 'danger' && 'border-rose-200 bg-gradient-to-br from-white to-rose-50',
        !tone && 'border-slate-200',
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
        {tone && (
          <AlertTriangle
            className={clsx('size-3.5', tone === 'danger' ? 'text-rose-500' : 'text-amber-500')}
          />
        )}
        {label}
      </p>
      <p
        className={clsx(
          'mt-2 text-2xl font-semibold tabular-nums',
          tone === 'warn' && 'text-amber-600',
          tone === 'danger' && 'text-rose-600',
          !tone && 'text-slate-900',
        )}
      >
        {value}
      </p>
      <p className="mt-0.5 text-xs text-slate-400">
        {tone === 'danger'
          ? 'Negative: more went out than came in'
          : tone === 'warn'
            ? 'Below minimum stock'
            : hint}
      </p>
    </div>
  );
}

function Item({ label, value, wide }: { label: string; value: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? 'sm:col-span-2' : undefined}>
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-slate-800">
        {value || <span className="text-slate-300">—</span>}
      </dd>
    </div>
  );
}

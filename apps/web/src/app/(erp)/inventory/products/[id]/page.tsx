'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AlertTriangle, Loader2, Pencil, Power, PowerOff, Printer } from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '@/lib/auth';
import {
  fmtMoney,
  fmtPrice,
  fmtQty,
  getProduct,
  marginPct,
  listTaxRates,
  priceWithTax,
  setProductActive,
  updateProduct,
  type ProductDetail,
  type TaxRate,
} from '@/lib/inventory';
import { ExpiryBadge } from '@/components/inventory/expiry-badge';
import { OpeningStockForm } from '@/components/inventory/opening-stock-form';
import { ProductPrices } from '@/components/inventory/product-prices';
import { StockMovements } from '@/components/inventory/stock-movements';
import { ProductForm } from '@/components/inventory/product-form';
import { ProductPhoto } from '@/components/inventory/product-photo';
import {
  Alert,
  PageHeader,
  RequirePermission,
  StatusBadge,
  btn,
  btnDanger,
  btnPrimary,
} from '@/components/inventory/ui';

export default function ProductPage() {
  return (
    <RequirePermission permission="inventory.product.read">
      <ProductView />
    </RequirePermission>
  );
}

function ProductView() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const canWrite = can('inventory.product.write');
  const canOpening = can('inventory.stock.adjust');
  const [defaultRate, setDefaultRate] = useState<TaxRate | undefined>();
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const reload = useCallback(() => {
    getProduct(id)
      .then(setProduct)
      .catch((e: Error) => setError(e.message));
  }, [id]);
  useEffect(reload, [reload]);
  useEffect(() => {
    listTaxRates()
      .then((r) => setDefaultRate(r.find((t) => t.isDefault)))
      .catch(() => undefined);
  }, []);

  async function toggleActive() {
    if (!product) return;
    if (
      product.isActive &&
      !confirm(`Deactivate ${product.name}? It will no longer be offered in new documents.`)
    )
      return;
    setBusy(true);
    setError(null);
    try {
      setProduct(await setProductActive(product.id, !product.isActive));
      setNotice(product.isActive ? 'Product deactivated.' : 'Product re-activated.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!product) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <PageHeader title="Product" crumbs={[{ label: '…' }]} />
        {error ? (
          <Alert>{error}</Alert>
        ) : (
          <Loader2 className="mx-auto mt-12 size-6 animate-spin text-slate-400" />
        )}
      </div>
    );
  }

  if (editing) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <PageHeader
          title={`Edit ${product.name}`}
          crumbs={[
            { label: product.sku, href: `/inventory/products/${product.id}` },
            { label: 'Edit' },
          ]}
        />
        <ProductForm
          product={product}
          submitLabel="Save changes"
          baseUnitLocked={product.stockBalances.length > 0 || product.lots.length > 0}
          onCancel={() => setEditing(false)}
          onSubmit={async (input) => {
            const { baseUnitId, ...rest } = input;
            const saved = await updateProduct(
              product.id,
              baseUnitId === product.baseUnitId ? rest : input,
            );
            setProduct(saved);
            setEditing(false);
            setNotice('Changes saved.');
          }}
        />
      </div>
    );
  }

  const canSeeCost = product.averageCost !== undefined;
  const rate = product.taxRate ?? defaultRate;
  const sale = Number(product.salePrice);
  const purchase = Number(product.purchasePrice ?? 0);
  const margin = canSeeCost ? marginPct(sale, purchase) : null;
  const canStock = can('inventory.stock.read');

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title={product.name}
        subtitle={product.sku}
        crumbs={[{ label: product.sku }]}
        actions={
          <>
            <Link className={btn} href={`/inventory/products/labels?ids=${product.id}`}>
              <Printer className="size-4" /> Labels
            </Link>
            {canWrite && (
              <>
                <button
                  className={product.isActive ? btnDanger : btn}
                  onClick={() => void toggleActive()}
                  disabled={busy}
                >
                  {product.isActive ? (
                    <PowerOff className="size-4" />
                  ) : (
                    <Power className="size-4" />
                  )}
                  {product.isActive ? 'Deactivate' : 'Re-activate'}
                </button>
                <button
                  className={btnPrimary}
                  onClick={() => {
                    setNotice(null);
                    setEditing(true);
                  }}
                >
                  <Pencil className="size-4" /> Edit
                </button>
              </>
            )}
          </>
        }
      />

      {notice && <Alert kind="success">{notice}</Alert>}
      {error && <Alert>{error}</Alert>}

      {/* Purchase price, sale price and margin on one line */}
      <div
        className={clsx('grid grid-cols-2 gap-4', canSeeCost ? 'lg:grid-cols-5' : 'lg:grid-cols-3')}
      >
        {canSeeCost && (
          <Stat
            label="Purchase price"
            value={fmtMoney(purchase)}
            hint={`excl. VAT — average cost ${fmtMoney(product.averageCost!)}`}
          />
        )}
        <Stat
          label="Sale price"
          value={fmtMoney(product.salePrice)}
          hint={
            rate
              ? `excl. VAT — ${fmtPrice(priceWithTax(product.salePrice, rate.rate))} incl. ${Number(rate.rate)} %`
              : `per ${product.baseUnit.code}, excl. VAT`
          }
        />
        {canSeeCost && (
          <Stat
            label="Margin"
            value={margin !== null ? `${margin.toFixed(1)} %` : '—'}
            hint={`${fmtMoney(sale - purchase)} per ${product.baseUnit.code}`}
            warn={margin !== null && margin < 0}
          />
        )}
        <Stat
          label="On hand"
          value={`${fmtQty(product.onHand)} ${product.baseUnit.code}`}
          hint={
            Number(product.minStock) > 0 ? `Minimum ${fmtQty(product.minStock)}` : 'No minimum set'
          }
          warn={product.isLowStock}
        />
        <Stat
          label="Status"
          value={<StatusBadge active={product.isActive} />}
          hint={
            product.trackLots
              ? 'Lot-tracked'
              : `Updated ${new Date(product.updatedAt).toLocaleDateString()}`
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[220px_1fr_1fr]">
        <ProductPhoto
          product={product}
          canWrite={canWrite}
          onChange={(imageUpdatedAt) => setProduct({ ...product, imageUpdatedAt })}
        />
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 font-semibold text-slate-900">Details</h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            <Dt>SKU</Dt>
            <dd className="font-mono">{product.sku}</dd>
            <Dt>Barcode</Dt>
            <dd className="font-mono">{product.barcode ?? '—'}</dd>
            <Dt>Category</Dt>
            <dd>{product.category?.name ?? '—'}</dd>
            <Dt>Base unit</Dt>
            <dd>
              {product.baseUnit.code} — {product.baseUnit.name}
            </dd>
            <Dt>Tax rate</Dt>
            <dd>
              {product.taxRate
                ? `${product.taxRate.name} (${Number(product.taxRate.rate)} %)`
                : `Company default${defaultRate ? ` (${defaultRate.name})` : ''}`}
            </dd>
            <Dt>Description</Dt>
            <dd className="whitespace-pre-line text-slate-700">{product.description ?? '—'}</dd>
          </dl>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 font-semibold text-slate-900">Stock per warehouse</h2>
          {product.stockBalances.length === 0 ? (
            <p className="text-sm text-slate-500">
              No stock yet. Stock arrives through goods receipts, opening balances or adjustments.
            </p>
          ) : (
            <table className="w-full text-sm">
              <tbody className="divide-y divide-slate-100">
                {product.stockBalances.map((b) => (
                  <tr key={b.warehouseId}>
                    <td className="py-2">
                      {b.warehouse.name}{' '}
                      <span className="text-xs text-slate-400">{b.warehouse.code}</span>
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {fmtQty(b.quantity)} {product.baseUnit.code}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {canOpening && product.isActive && (
            <OpeningStockForm
              productId={product.id}
              unitCode={product.baseUnit.code}
              usedWarehouseIds={product.stockBalances.map((b) => b.warehouseId)}
              trackLots={product.trackLots}
              defaultCost={product.purchasePrice}
              onSaved={() => {
                reload();
                setNotice('Opening stock saved.');
              }}
            />
          )}
        </section>
      </div>

      <div className={clsx('grid grid-cols-1 gap-6', product.trackLots && 'lg:grid-cols-2')}>
        <ProductPrices
          productId={product.id}
          salePrice={product.salePrice}
          unitCode={product.baseUnit.code}
          canWrite={canWrite}
        />
        {product.trackLots && (
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-3 font-semibold text-slate-900">Lots in stock</h2>
            {product.lots.filter((l) => l.balances.length > 0).length === 0 ? (
              <p className="text-sm text-slate-500">No lot in stock.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-slate-500 uppercase">
                  <tr>
                    <th className="py-2">Lot</th>
                    <th className="py-2">Expiry</th>
                    <th className="py-2 text-right">Quantity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {product.lots
                    .filter((l) => l.balances.length > 0)
                    .map((l) => (
                      <tr key={l.id}>
                        <td className="py-2 font-mono text-xs font-medium">{l.lotNumber}</td>
                        <td className="py-2">
                          <ExpiryBadge date={l.expiryDate} />
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          {l.balances.map((b) => (
                            <span key={b.warehouseId} className="block">
                              {fmtQty(b.quantity)} {product.baseUnit.code}
                              {product.stockBalances.length > 1 && (
                                <span className="ml-1 text-xs text-slate-400">
                                  {b.warehouse.code}
                                </span>
                              )}
                            </span>
                          ))}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}
          </section>
        )}
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 font-semibold text-slate-900">Packaging / alternative units</h2>
        {product.units.length === 0 ? (
          <p className="text-sm text-slate-500">
            Only the base unit ({product.baseUnit.code}) is used.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-slate-500 uppercase">
                <tr>
                  <th className="py-2">Unit</th>
                  <th className="py-2">Contains</th>
                  <th className="py-2">Barcode</th>
                  <th className="py-2">Used for</th>
                  <th className="py-2 text-right">Price per unit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {product.units.map((u) => (
                  <tr key={u.id}>
                    <td className="py-2 font-medium">
                      {u.unit.code}{' '}
                      <span className="font-normal text-slate-500">— {u.unit.name}</span>
                    </td>
                    <td className="py-2">
                      {fmtQty(u.factor)} {product.baseUnit.code}
                    </td>
                    <td className="py-2 font-mono text-xs">{u.barcode ?? '—'}</td>
                    <td className="py-2 text-slate-600">
                      {[u.forPurchase && 'Purchase', u.forSale && 'Sale']
                        .filter(Boolean)
                        .join(', ') || '—'}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {fmtMoney(Number(product.salePrice) * Number(u.factor))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {canStock && (
        <StockMovements
          productId={product.id}
          sku={product.sku}
          unitCode={product.baseUnit.code}
          trackLots={product.trackLots}
        />
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  warn,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  warn?: boolean;
}) {
  return (
    <div
      className={clsx(
        'rounded-xl border bg-white p-4',
        warn ? 'border-amber-300' : 'border-slate-200',
      )}
    >
      <p className="flex items-center gap-1 text-xs font-medium text-slate-500">
        {label}
        {warn && <AlertTriangle className="size-3.5 text-amber-500" aria-label="Low stock" />}
      </p>
      <div
        className={clsx('mt-1 text-xl font-semibold', warn ? 'text-amber-600' : 'text-slate-900')}
      >
        {value}
      </div>
      {hint && <p className="mt-0.5 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

const Dt = ({ children }: { children: React.ReactNode }) => (
  <dt className="text-slate-500">{children}</dt>
);

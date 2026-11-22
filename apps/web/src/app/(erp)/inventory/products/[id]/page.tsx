'use client';

import Link from 'next/link';
import { use, useCallback, useEffect, useState } from 'react';
import { Copy, History, Pencil, Power, PowerOff, Warehouse } from 'lucide-react';
import {
  PRODUCT_TYPE_LABELS,
  type DeactivationCheck,
  type ProductDetail,
  type ProductHistoryEntry,
  type ProductStockDto,
} from '@erp/shared';
import { api, ApiRequestError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { PermissionGate } from '@/components/permission-gate';
import {
  MarginText,
  ProductImage,
  StockBadge,
  TypeBadge,
} from '@/components/products/product-bits';
import {
  Badge,
  Breadcrumbs,
  Button,
  Card,
  ConfirmDialog,
  ErrorBox,
  PageLoader,
  buttonClass,
  formatAmount,
  formatDateTime,
  formatQty,
  useToast,
} from '@/components/ui';

const ACTION_LABELS: Record<string, string> = {
  create: 'Created',
  update: 'Updated',
  activate: 'Re-activated',
  deactivate: 'Deactivated',
  'image-update': 'Picture changed',
  'image-remove': 'Picture removed',
};

const FIELD_LABELS: Record<string, string> = {
  salePrice: 'sale price',
  purchasePrice: 'purchase price',
  minStock: 'min stock',
  categoryId: 'category',
  baseUnitId: 'base unit',
  taxRateId: 'tax rate',
  isActive: 'status',
  units: 'extra units',
};

export default function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <PermissionGate permission="inventory.product.read">
      <ProductDetailView id={id} />
    </PermissionGate>
  );
}

function ProductDetailView({ id }: { id: string }) {
  const { can } = useAuth();
  const toast = useToast();
  const canWrite = can('inventory.product.write');
  const canSeeStock = can('inventory.stock.read');

  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [error, setError] = useState<{ message: string; notFound: boolean } | null>(null);
  const [stock, setStock] = useState<ProductStockDto | null>(null);
  const [history, setHistory] = useState<ProductHistoryEntry[] | null>(null);
  const [check, setCheck] = useState<DeactivationCheck | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setError(null);
    api<ProductDetail>(`/inventory/products/${id}`)
      .then(setProduct)
      .catch((e: Error) =>
        setError({
          message: e.message,
          notFound: e instanceof ApiRequestError && (e.status === 404 || e.status === 400),
        }),
      );
    api<ProductHistoryEntry[]>(`/inventory/products/${id}/history`)
      .then(setHistory)
      .catch(() => setHistory([]));
    if (canSeeStock)
      api<ProductStockDto>(`/inventory/products/${id}/stock`)
        .then(setStock)
        .catch(() => setStock(null));
  }, [id, canSeeStock]);
  useEffect(load, [load]);

  const askDeactivate = async () => {
    setCheck(null);
    setConfirmOpen(true);
    api<DeactivationCheck>(`/inventory/products/${id}/deactivation-check`)
      .then(setCheck)
      .catch(() => undefined);
  };

  const setActive = async (active: boolean) => {
    setBusy(true);
    try {
      const p = await api<ProductDetail>(
        `/inventory/products/${id}/${active ? 'activate' : 'deactivate'}`,
        { method: 'POST' },
      );
      setProduct(p);
      toast(active ? `${p.name} is active again` : `${p.name} deactivated`);
      setConfirmOpen(false);
      api<ProductHistoryEntry[]>(`/inventory/products/${id}/history`)
        .then(setHistory)
        .catch(() => undefined);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  if (error) {
    return (
      <div className="mx-auto max-w-5xl space-y-4">
        {error.notFound ? (
          <div className="rounded-xl border border-slate-200 bg-white p-10 text-center">
            <h1 className="text-lg font-semibold text-slate-900">Product not found</h1>
            <p className="mt-1 text-sm text-slate-500">
              It may have been removed, or the link is wrong.
            </p>
            <Link href="/inventory/products" className={buttonClass('secondary') + ' mt-4'}>
              Back to products
            </Link>
          </div>
        ) : (
          <ErrorBox message={error.message} onRetry={load} />
        )}
      </div>
    );
  }
  if (!product) return <PageLoader />;

  const p = product;
  const cost =
    p.averageCost !== undefined
      ? Number(p.averageCost) > 0
        ? p.averageCost
        : p.purchasePrice
      : undefined;
  const warnings =
    check &&
    (Number(check.stockOnHand) !== 0 || check.openPurchaseOrders > 0 || check.openSalesOrders > 0);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div>
        <Breadcrumbs
          items={[
            { label: 'Home', href: '/dashboard' },
            { label: 'Inventory' },
            { label: 'Products', href: '/inventory/products' },
            { label: p.sku },
          ]}
        />
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <ProductImage
              productId={p.id}
              hasImage={p.hasImage}
              version={p.updatedAt}
              size="lg"
              className="!size-24"
            />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold text-slate-900">{p.name}</h1>
                {p.isActive ? (
                  <Badge tone="green">Active</Badge>
                ) : (
                  <Badge tone="slate">Inactive</Badge>
                )}
                <TypeBadge type={p.type} />
              </div>
              <p className="mt-1 font-mono text-sm text-slate-500">
                {p.sku}
                {p.barcode && ` · ${p.barcode}`}
              </p>
              {p.categoryName && <p className="mt-1 text-sm text-slate-500">{p.categoryName}</p>}
            </div>
          </div>
          {canWrite && (
            <div className="flex flex-wrap gap-2">
              <Link href={`/inventory/products/new?from=${p.id}`} className={buttonClass()}>
                <Copy className="size-4" /> Duplicate
              </Link>
              {p.isActive ? (
                <Button onClick={askDeactivate}>
                  <PowerOff className="size-4" /> Deactivate
                </Button>
              ) : (
                <Button onClick={() => setActive(true)} loading={busy}>
                  <Power className="size-4" /> Re-activate
                </Button>
              )}
              <Link href={`/inventory/products/${p.id}/edit`} className={buttonClass('primary')}>
                <Pencil className="size-4" /> Edit
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Key figures */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi
          label="Sale price"
          value={formatAmount(p.salePrice)}
          hint={p.taxRateName ?? 'Company default tax'}
        />
        {cost !== undefined && (
          <Kpi
            label={Number(p.averageCost) > 0 ? 'Average cost' : 'Purchase price'}
            value={formatAmount(cost)}
          />
        )}
        {p.marginPct !== undefined && (
          <Kpi label="Margin" value={<MarginText value={p.marginPct} />} />
        )}
        <Kpi
          label="Stock on hand"
          value={p.type === 'STOCKABLE' ? `${formatQty(p.stockOnHand)} ${p.baseUnitCode}` : '—'}
          hint={
            p.type === 'STOCKABLE' ? (
              <StockBadge status={p.stockStatus} qty={p.stockOnHand} />
            ) : (
              'Not tracked'
            )
          }
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card title="Details">
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <Info label="Type">{PRODUCT_TYPE_LABELS[p.type]}</Info>
              <Info label="Category">{p.categoryName}</Info>
              <Info label="Base unit">
                {p.baseUnitCode} — {p.baseUnitName}
              </Info>
              <Info label="Tax rate">{p.taxRateName ?? 'Company default'}</Info>
              {p.type === 'STOCKABLE' && (
                <Info label="Minimum stock">
                  {formatQty(p.minStock)} {p.baseUnitCode}
                </Info>
              )}
              <Info label="Created">{formatDateTime(p.createdAt)}</Info>
              <Info label="Description" wide>
                {p.description ? (
                  <span className="whitespace-pre-line">{p.description}</span>
                ) : null}
              </Info>
            </dl>
          </Card>

          <Card title="Units">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-slate-500">
                <tr>
                  <th className="pb-2 font-medium">Unit</th>
                  <th className="pb-2 font-medium">Contains</th>
                  <th className="pb-2 font-medium">Barcode</th>
                  <th className="pb-2 font-medium">Used for</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr>
                  <td className="py-2">
                    {p.baseUnitCode} <Badge tone="slate">base</Badge>
                  </td>
                  <td className="py-2">1 {p.baseUnitCode}</td>
                  <td className="py-2 font-mono text-xs">{p.barcode ?? '—'}</td>
                  <td className="py-2 text-slate-500">Stock, purchase, sale</td>
                </tr>
                {p.units.map((u) => (
                  <tr key={u.id}>
                    <td className="py-2">
                      {u.unitCode} — {u.unitName}
                    </td>
                    <td className="py-2 tabular-nums">
                      {formatQty(u.factor)} {p.baseUnitCode}
                    </td>
                    <td className="py-2 font-mono text-xs">{u.barcode ?? '—'}</td>
                    <td className="py-2 text-slate-500">
                      {[u.forPurchase && 'purchase', u.forSale && 'sale']
                        .filter(Boolean)
                        .join(', ') || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {canSeeStock && p.type === 'STOCKABLE' && (
            <Card
              title={
                <span className="flex items-center gap-2">
                  <Warehouse className="size-4 text-slate-400" /> Stock
                </span>
              }
            >
              {!stock ? (
                <p className="text-sm text-slate-400">Loading…</p>
              ) : (
                <div className="space-y-4">
                  {stock.balances.length === 0 ? (
                    <p className="text-sm text-slate-500">No stock in any warehouse yet.</p>
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-3">
                      {stock.balances.map((b) => (
                        <div key={b.warehouseId} className="rounded-lg bg-slate-50 p-3">
                          <p className="text-xs text-slate-500">{b.warehouseName}</p>
                          <p className="text-lg font-semibold tabular-nums">
                            {formatQty(b.quantity)}{' '}
                            <span className="text-xs font-normal text-slate-500">
                              {p.baseUnitCode}
                            </span>
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                  <div>
                    <p className="mb-2 text-sm font-medium text-slate-700">Last movements</p>
                    {stock.moves.length === 0 ? (
                      <p className="text-sm text-slate-500">
                        No movements yet. Stock arrives through goods receipts or adjustments.
                      </p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="text-left text-xs text-slate-500">
                            <tr>
                              <th className="pb-1 font-medium">Date</th>
                              <th className="pb-1 font-medium">Type</th>
                              <th className="pb-1 font-medium">Warehouse</th>
                              <th className="pb-1 font-medium">Reference</th>
                              <th className="pb-1 text-right font-medium">Qty</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {stock.moves.map((m) => (
                              <tr key={m.id}>
                                <td className="py-1.5 text-xs whitespace-nowrap">
                                  {formatDateTime(m.date)}
                                </td>
                                <td className="py-1.5 text-xs">
                                  {m.type.replace('_', ' ').toLowerCase()}
                                </td>
                                <td className="py-1.5 text-xs">{m.warehouseCode}</td>
                                <td className="py-1.5 font-mono text-xs">{m.reference ?? '—'}</td>
                                <td
                                  className={
                                    'py-1.5 text-right tabular-nums ' +
                                    (Number(m.quantity) < 0 ? 'text-red-600' : 'text-emerald-700')
                                  }
                                >
                                  {Number(m.quantity) > 0 ? '+' : ''}
                                  {formatQty(m.quantity)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </Card>
          )}
        </div>

        <Card
          title={
            <span className="flex items-center gap-2">
              <History className="size-4 text-slate-400" /> History
            </span>
          }
        >
          {!history ? (
            <p className="text-sm text-slate-400">Loading…</p>
          ) : history.length === 0 ? (
            <p className="text-sm text-slate-500">No recorded changes.</p>
          ) : (
            <ol className="space-y-3">
              {history.map((h) => (
                <li key={h.id} className="border-l-2 border-slate-200 pl-3 text-sm">
                  <p className="font-medium text-slate-800">
                    {ACTION_LABELS[h.action] ?? h.action}
                  </p>
                  {h.changedFields.length > 0 && (
                    <p className="text-xs text-slate-500">
                      {h.changedFields.map((f) => FIELD_LABELS[f] ?? f).join(', ')}
                    </p>
                  )}
                  <p className="text-xs text-slate-400">
                    {formatDateTime(h.date)} · {h.userName ?? 'system'}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title={`Deactivate ${p.name}?`}
        confirmLabel="Deactivate"
        danger
        busy={busy}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => setActive(false)}
      >
        <p>
          The product will no longer be offered in new orders and invoices. Its history, documents
          and stock are kept, and you can re-activate it at any time.
        </p>
        {warnings && (
          <ul className="mt-3 list-disc space-y-1 rounded-md bg-amber-50 py-2 pr-3 pl-7 text-amber-800">
            {Number(check!.stockOnHand) !== 0 && (
              <li>
                {formatQty(check!.stockOnHand)} {p.baseUnitCode} are still in stock.
              </li>
            )}
            {check!.openPurchaseOrders > 0 && (
              <li>It is on {check!.openPurchaseOrders} open purchase order(s).</li>
            )}
            {check!.openSalesOrders > 0 && (
              <li>It is on {check!.openSalesOrders} open quotation(s) / sales order(s).</li>
            )}
          </ul>
        )}
      </ConfirmDialog>
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-slate-900 tabular-nums">{value}</p>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

function Info({
  label,
  children,
  wide,
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={wide ? 'sm:col-span-2' : undefined}>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-slate-800">
        {children ?? <span className="text-slate-300">—</span>}
      </dd>
    </div>
  );
}

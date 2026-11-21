'use client';

import { use, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Barcode,
  Boxes,
  CalendarClock,
  Coins,
  ImageOff,
  ImagePlus,
  Images,
  Layers,
  LineChart,
  Package,
  PencilLine,
  Percent,
  Plus,
  Power,
  Save,
  ShoppingBag,
  Star,
  Tags,
  Trash2,
  UploadCloud,
  Warehouse,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { formatDateTime, formatMoney, formatPct, formatQty, toNum } from '@/lib/format';
import {
  productsApi,
  type ProductDetail,
  type ProductImage,
  type ProductStats,
} from '@/lib/products';
import {
  AnimatedNumber,
  Badge,
  Breadcrumbs,
  Button,
  ButtonLink,
  Card,
  EmptyState,
  inputClass,
  Skeleton,
  useToast,
} from '@/components/ui';
import { ChipsInput } from '@/components/product-form';
import { RevenueChart } from '@/components/revenue-chart';

type Tab = 'overview' | 'variants' | 'images' | 'prices' | 'stock';

export default function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { can } = useAuth();
  const toast = useToast();
  const [p, setP] = useState<ProductDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [toggling, setToggling] = useState(false);

  const load = useCallback(
    () => productsApi.get(id).then(setP).catch((e: Error) => setError(e.message)),
    [id],
  );
  useEffect(() => {
    setP(null);
    setTab('overview');
    void load();
  }, [load]);

  const canWrite = can('inventory.product.write');

  if (error) {
    return (
      <div className="mx-auto max-w-xl">
        <EmptyState
          icon={Package}
          title="Product not available"
          text={error}
          action={<ButtonLink href="/inventory/products">Back to products</ButtonLink>}
        />
      </div>
    );
  }
  if (!p) return <DetailSkeleton />;

  const mainImage = p.images.find((i) => i.isMain) ?? p.images[0];
  const tabs: { key: Tab; label: string; icon: LucideIcon; count?: number; hidden?: boolean }[] = [
    { key: 'overview', label: 'Overview', icon: LineChart },
    { key: 'variants', label: 'Variants', icon: Layers, count: p.variants.length, hidden: !p.hasVariants },
    { key: 'images', label: 'Images', icon: Images, count: p.images.length },
    { key: 'prices', label: 'Prices', icon: Tags },
    { key: 'stock', label: 'Stock', icon: Warehouse, hidden: !can('inventory.stock.read') },
  ];

  async function toggleActive() {
    if (!p) return;
    const next = !p.isActive;
    if (!next && p.hasVariants && !confirm(`Deactivate ${p.name} and its ${p.variants.length} variants?`)) return;
    setToggling(true);
    try {
      await productsApi.setActive(p.id, next);
      toast('success', next ? 'Product activated' : 'Product deactivated');
      await load();
    } catch (e) {
      toast('error', (e as Error).message);
    } finally {
      setToggling(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* ── Header ── */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/80 md:p-6"
      >
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500" />
        <div className="absolute -top-24 -right-24 size-64 rounded-full bg-gradient-to-br from-emerald-200/40 to-teal-200/20 blur-3xl" />
        <div className="relative">
          <Breadcrumbs
            items={[
              { label: 'Home', href: '/dashboard' },
              { label: 'Products', href: '/inventory/products' },
              ...(p.parent ? [{ label: p.parent.name, href: `/inventory/products/${p.parent.id}` }] : []),
              { label: p.sku },
            ]}
          />
          <div className="mt-4 flex flex-col gap-5 md:flex-row md:items-center">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 22 }}
              className="grid size-24 shrink-0 place-items-center overflow-hidden rounded-2xl bg-gradient-to-br from-slate-50 to-slate-100 ring-1 ring-slate-200"
            >
              {mainImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={mainImage.url} alt={p.name} width={96} height={96} className="size-24 object-cover" />
              ) : (
                <ImageOff className="size-8 text-slate-300" />
              )}
            </motion.div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold text-slate-900">{p.name}</h1>
                {p.isActive ? <Badge tone="green">Active</Badge> : <Badge tone="slate">Inactive</Badge>}
                {p.hasVariants && (
                  <Badge tone="violet" icon={Layers}>
                    {p.variants.length} variants
                  </Badge>
                )}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
                <span className="font-mono">{p.sku}</span>
                {p.barcode && (
                  <span className="inline-flex items-center gap-1 font-mono">
                    <Barcode className="size-3.5" /> {p.barcode}
                  </span>
                )}
                {p.category && <span>{p.category.name}</span>}
                {p.variantValues && <VariantChips values={p.variantValues} />}
              </div>
              {p.parent && (
                <p className="mt-2 text-sm text-slate-500">
                  Variant of{' '}
                  <Link href={`/inventory/products/${p.parent.id}`} className="font-medium text-emerald-700 hover:underline">
                    {p.parent.name}
                  </Link>
                </p>
              )}
            </div>
            {canWrite && (
              <div className="flex flex-wrap gap-2">
                <ButtonLink href={`/inventory/products/${p.id}/edit`} icon={PencilLine} variant="primary">
                  Edit
                </ButtonLink>
                <Button
                  icon={Power}
                  variant={p.isActive ? 'danger' : 'secondary'}
                  loading={toggling}
                  onClick={toggleActive}
                >
                  {p.isActive ? 'Deactivate' : 'Activate'}
                </Button>
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 overflow-x-auto border-b border-slate-200">
        {tabs
          .filter((t) => !t.hidden)
          .map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={clsx(
                'relative inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors',
                tab === t.key ? 'text-emerald-700' : 'text-slate-500 hover:text-slate-800',
              )}
            >
              <t.icon className="size-4" />
              {t.label}
              {t.count !== undefined && (
                <span
                  className={clsx(
                    'rounded-full px-1.5 text-[11px] tabular-nums',
                    tab === t.key ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500',
                  )}
                >
                  {t.count}
                </span>
              )}
              {tab === t.key && (
                <motion.span
                  layoutId="product-tab"
                  className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500"
                />
              )}
            </button>
          ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2 }}
        >
          {tab === 'overview' && <OverviewTab p={p} />}
          {tab === 'variants' && <VariantsTab p={p} canWrite={canWrite} onChange={load} />}
          {tab === 'images' && <ImagesTab p={p} canWrite={canWrite} onChange={load} />}
          {tab === 'prices' && <PricesTab p={p} canWrite={canWrite} onChange={load} />}
          {tab === 'stock' && <StockTab p={p} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ───────────────────────────── Overview ─────────────────────────────

const PERIODS = [30, 90, 365];

function OverviewTab({ p }: { p: ProductDetail }) {
  const { can } = useAuth();
  const [days, setDays] = useState(30);
  const [stats, setStats] = useState<ProductStats | null>(null);
  useEffect(() => {
    setStats(null);
    productsApi.stats(p.id, days).then(setStats).catch(() => undefined);
  }, [p.id, days]);

  const low = p.hasVariants ? p.variants.some((v) => v.lowStock) : p.isActive && toNum(p.minStock) > 0 && toNum(p.onHand) < toNum(p.minStock);
  const showCost = can('inventory.cost.view');

  const kpis: { label: string; icon: LucideIcon; value?: number; fmt: (n: number) => string; sub?: React.ReactNode; tone?: 'warn' }[] = [
    {
      label: 'On hand',
      icon: Boxes,
      value: toNum(p.onHand),
      fmt: (n) => `${formatQty(Math.round(n))} ${p.baseUnit.code}`,
      sub: low ? (
        <Badge tone="amber" icon={AlertTriangle} pulse>
          {p.hasVariants ? 'Some variants are low' : `Under minimum (${formatQty(p.minStock)})`}
        </Badge>
      ) : toNum(p.minStock) > 0 ? (
        `Minimum ${formatQty(p.minStock)} ${p.baseUnit.code}`
      ) : (
        'No low-stock alert set'
      ),
      tone: low ? 'warn' : undefined,
    },
    {
      label: `Units sold · ${days} d`,
      icon: ShoppingBag,
      value: stats ? toNum(stats.soldQty) : undefined,
      fmt: (n) => formatQty(Math.round(n)),
      sub: stats ? `${stats.orderCount} order${stats.orderCount === 1 ? '' : 's'}` : undefined,
    },
    {
      label: `Revenue · ${days} d`,
      icon: Coins,
      value: stats ? toNum(stats.revenue) : undefined,
      fmt: formatMoney,
      sub: 'Confirmed sales orders',
    },
    showCost
      ? {
          label: 'Gross margin',
          icon: Percent,
          value: stats?.marginPct ?? undefined,
          fmt: (n) => formatPct(n),
          sub: stats?.stockValue !== undefined ? `Stock value ${formatMoney(stats.stockValue)}` : undefined,
        }
      : {
          label: 'Stock coverage',
          icon: CalendarClock,
          value: stats?.coverageDays ?? undefined,
          fmt: (n) => `${Math.round(n)} days`,
          sub: 'At the current sales pace',
        },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((k, i) => (
          <motion.div
            key={k.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
            whileHover={{ y: -3 }}
            className={clsx(
              'rounded-2xl p-5 shadow-sm ring-1 transition-shadow hover:shadow-md',
              k.tone === 'warn'
                ? 'bg-gradient-to-br from-amber-50 to-orange-50 ring-amber-200'
                : 'bg-white ring-slate-200/80',
            )}
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-slate-500">{k.label}</p>
              <div className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-emerald-50 to-teal-50 ring-1 ring-emerald-100">
                <k.icon className="size-4 text-emerald-600" />
              </div>
            </div>
            <div className="mt-3 text-2xl font-semibold text-slate-900 tabular-nums">
              {k.value === undefined ? (
                stats || i === 0 ? <span className="text-slate-300">—</span> : <Skeleton className="h-8 w-24" />
              ) : (
                <AnimatedNumber value={k.value} format={k.fmt} />
              )}
            </div>
            <div className="mt-1 text-xs text-slate-500">{k.sub}</div>
          </motion.div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card
          title="Daily revenue"
          icon={LineChart}
          className="lg:col-span-2"
          action={
            <div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-xs">
              {PERIODS.map((d) => (
                <button
                  key={d}
                  onClick={() => setDays(d)}
                  className={clsx(
                    'relative rounded-md px-2.5 py-1 font-medium',
                    days === d ? 'text-slate-900' : 'text-slate-500 hover:text-slate-700',
                  )}
                >
                  {days === d && (
                    <motion.span layoutId="period" className="absolute inset-0 rounded-md bg-white shadow-sm ring-1 ring-slate-200" />
                  )}
                  <span className="relative">{d === 365 ? '1 year' : `${d} days`}</span>
                </button>
              ))}
            </div>
          }
        >
          <div className="p-5">{stats ? <RevenueChart series={stats.series} /> : <Skeleton className="h-36" />}</div>
        </Card>

        <Card title="Details" icon={Package} delay={0.1}>
          <dl className="divide-y divide-slate-100 text-sm">
            <Row label="Sale price" value={formatMoney(p.salePrice)} strong />
            {p.averageCost !== undefined && <Row label="Average cost" value={formatMoney(p.averageCost)} />}
            <Row label="Base unit" value={`${p.baseUnit.code} — ${p.baseUnit.name}`} />
            <Row label="Tax" value={p.taxRate ? `${p.taxRate.name} (${Number(p.taxRate.rate)} %)` : '—'} />
            <Row label="Category" value={p.category?.name ?? '—'} />
            {p.units.length > 0 && (
              <Row
                label="Other units"
                value={p.units.map((u) => `1 ${u.unit.code} = ${formatQty(u.factor)} ${p.baseUnit.code}`).join(', ')}
              />
            )}
            <Row label="Updated" value={formatDateTime(p.updatedAt)} />
          </dl>
          {p.description && <p className="border-t border-slate-100 px-5 py-4 text-sm whitespace-pre-line text-slate-600">{p.description}</p>}
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 py-2.5">
      <dt className="text-slate-500">{label}</dt>
      <dd className={clsx('text-right', strong ? 'font-semibold text-slate-900' : 'text-slate-700')}>{value}</dd>
    </div>
  );
}

function VariantChips({ values }: { values: Record<string, string> }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      {Object.entries(values).map(([k, v]) => (
        <span key={k} className="rounded-md bg-violet-50 px-1.5 py-0.5 text-[11px] font-medium text-violet-700 ring-1 ring-violet-100" title={k}>
          {v}
        </span>
      ))}
    </span>
  );
}

// ───────────────────────────── Variants ─────────────────────────────

function VariantsTab({ p, canWrite, onChange }: { p: ProductDetail; canWrite: boolean; onChange: () => Promise<unknown> }) {
  const toast = useToast();
  const options = p.variantOptions ?? [];
  const [adding, setAdding] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);

  // New combinations = all combinations with the new values − existing ones.
  const total = options.reduce((n, o) => n * (o.values.length + (adding[o.name]?.length ?? 0)), 1);
  const newCount = total - p.variants.length;

  async function save() {
    setSaving(true);
    try {
      const res = await productsApi.addVariants(
        p.id,
        options.map((o) => ({ name: o.name, values: adding[o.name] ?? [] })).filter((o) => o.values.length),
      );
      toast('success', `${res.created} variant${res.created === 1 ? '' : 's'} created`);
      setAdding({});
      setOpen(false);
      await onChange();
    } catch (e) {
      toast('error', (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card
        title={`Variants · ${options.map((o) => o.name).join(' × ')}`}
        icon={Layers}
        action={
          canWrite && (
            <Button size="sm" icon={Plus} onClick={() => setOpen((v) => !v)}>
              Add values
            </Button>
          )
        }
      >
        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden border-b border-slate-100 bg-gradient-to-br from-violet-50/60 to-white"
            >
              <div className="space-y-3 p-5">
                {options.map((o) => (
                  <div key={o.name} className="grid gap-2 md:grid-cols-[160px_1fr] md:items-center">
                    <div>
                      <p className="text-sm font-medium text-slate-800">{o.name}</p>
                      <p className="text-xs text-slate-500">Now: {o.values.join(', ')}</p>
                    </div>
                    <ChipsInput values={adding[o.name] ?? []} onChange={(v) => setAdding((a) => ({ ...a, [o.name]: v }))} />
                  </div>
                ))}
                <div className="flex items-center justify-end gap-3">
                  <span className="text-sm text-violet-700">
                    {newCount > 0 ? `${newCount} new variant${newCount > 1 ? 's' : ''}` : 'Type new values above'}
                  </span>
                  <Button variant="primary" icon={Save} loading={saving} disabled={newCount <= 0} onClick={save}>
                    Create variants
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
                <th className="py-3 pl-5">Variant</th>
                <th className="px-3 py-3">SKU</th>
                <th className="hidden px-3 py-3 md:table-cell">Barcode</th>
                <th className="px-3 py-3 text-right">Price</th>
                <th className="px-3 py-3 text-right">Stock</th>
                <th className="py-3 pr-5 text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {p.variants.map((v, i) => (
                <motion.tr
                  key={v.id}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: Math.min(i * 0.03, 0.4) }}
                  className="border-b border-slate-50 last:border-0 hover:bg-emerald-50/40"
                >
                  <td className="py-2.5 pl-5">
                    <Link href={`/inventory/products/${v.id}`} className="inline-flex items-center gap-2 hover:text-emerald-700">
                      {v.variantValues ? <VariantChips values={v.variantValues} /> : v.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs text-slate-600">{v.sku}</td>
                  <td className="hidden px-3 py-2.5 font-mono text-xs text-slate-500 md:table-cell">
                    {v.barcode ?? (canWrite ? (
                      <Link href={`/inventory/products/${v.id}/edit`} className="text-emerald-700 hover:underline">
                        + add
                      </Link>
                    ) : '—')}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{formatMoney(v.salePrice)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    <span className={clsx(v.lowStock && 'font-medium text-amber-700')}>{formatQty(v.onHand)}</span>
                    {v.lowStock && <AlertTriangle className="ml-1 inline size-3.5 text-amber-500" />}
                  </td>
                  <td className="py-2.5 pr-5 text-right">
                    {v.isActive ? <Badge tone="green">Active</Badge> : <Badge tone="slate">Inactive</Badge>}
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <p className="text-xs text-slate-500">
        Open a variant to set its own barcode, price or minimum stock. Variants are never deleted — deactivate the ones you
        stop selling.
      </p>
    </div>
  );
}

// ───────────────────────────── Images ─────────────────────────────

function ImagesTab({ p, canWrite, onChange }: { p: ProductDetail; canWrite: boolean; onChange: () => Promise<unknown> }) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  async function upload(files: File[]) {
    const images = files.filter((f) => f.type.startsWith('image/'));
    if (!images.length) return toast('error', 'Choose JPEG, PNG, WebP or GIF images');
    const tooBig = images.find((f) => f.size > 5 * 1024 * 1024);
    if (tooBig) return toast('error', `${tooBig.name} is larger than 5 MB`);
    setUploading(true);
    try {
      await productsApi.uploadImages(p.id, images);
      toast('success', `${images.length} image${images.length > 1 ? 's' : ''} uploaded`);
      await onChange();
    } catch (e) {
      toast('error', (e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function act(img: ProductImage, action: 'main' | 'delete') {
    if (action === 'delete' && !confirm(`Delete ${img.fileName}?`)) return;
    setBusy(img.id);
    try {
      if (action === 'main') await productsApi.setMainImage(p.id, img.id);
      else await productsApi.deleteImage(p.id, img.id);
      toast('success', action === 'main' ? 'Main image updated' : 'Image deleted');
      await onChange();
    } catch (e) {
      toast('error', (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      {canWrite && p.images.length < 10 && (
        <motion.div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void upload([...e.dataTransfer.files]);
          }}
          onClick={() => input.current?.click()}
          animate={{ scale: dragging ? 1.01 : 1 }}
          className={clsx(
            'flex cursor-pointer flex-col items-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors',
            dragging ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/40',
          )}
        >
          <motion.div
            animate={uploading ? { y: [0, -6, 0] } : dragging ? { scale: 1.15 } : { scale: 1 }}
            transition={uploading ? { repeat: Infinity, duration: 0.9 } : undefined}
            className="grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-600/25"
          >
            <UploadCloud className="size-6" />
          </motion.div>
          <p className="mt-3 font-medium text-slate-800">
            {uploading ? 'Uploading…' : 'Drop images here or click to choose'}
          </p>
          <p className="text-xs text-slate-500">JPEG, PNG, WebP or GIF · up to 5 MB each · {10 - p.images.length} left</p>
          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            multiple
            hidden
            onChange={(e) => {
              void upload([...(e.target.files ?? [])]);
              e.target.value = '';
            }}
          />
        </motion.div>
      )}

      {p.images.length === 0 ? (
        !canWrite && <EmptyState icon={ImagePlus} title="No images yet" text="Pictures added to this product will appear here." />
      ) : (
        <motion.div layout className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <AnimatePresence>
            {p.images.map((img, i) => (
              <motion.figure
                key={img.id}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: busy === img.id ? 0.5 : 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ delay: i * 0.04 }}
                whileHover={{ y: -4 }}
                className={clsx(
                  'group relative overflow-hidden rounded-2xl bg-white shadow-sm ring-1 transition-shadow hover:shadow-lg',
                  img.isMain ? 'ring-2 ring-emerald-400' : 'ring-slate-200',
                )}
              >
                <a href={img.url} target="_blank" rel="noreferrer" className="block aspect-square bg-slate-50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.url} alt={img.fileName} className="size-full object-cover transition duration-500 group-hover:scale-105" />
                </a>
                {img.isMain && (
                  <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 px-2 py-0.5 text-[11px] font-semibold text-white shadow">
                    <Star className="size-3 fill-current" /> Main
                  </span>
                )}
                {canWrite && (
                  <div className="absolute inset-x-2 bottom-2 flex justify-end gap-1.5 opacity-100 transition md:translate-y-2 md:opacity-0 md:group-hover:translate-y-0 md:group-hover:opacity-100">
                    {!img.isMain && (
                      <button
                        onClick={() => act(img, 'main')}
                        className="rounded-lg bg-white/90 p-1.5 text-slate-700 shadow backdrop-blur hover:text-emerald-600"
                        title="Make main image"
                      >
                        <Star className="size-4" />
                      </button>
                    )}
                    <button
                      onClick={() => act(img, 'delete')}
                      className="rounded-lg bg-white/90 p-1.5 text-slate-700 shadow backdrop-blur hover:text-red-600"
                      title="Delete image"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                )}
              </motion.figure>
            ))}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  );
}

// ───────────────────────────── Prices ─────────────────────────────

function PricesTab({ p, canWrite, onChange }: { p: ProductDetail; canWrite: boolean; onChange: () => Promise<unknown> }) {
  const toast = useToast();
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(p.prices.map((r) => [r.priceList.id, r.price === null ? '' : String(Number(r.price))])),
  );
  const [applyToVariants, setApply] = useState(true);
  const [saving, setSaving] = useState(false);
  const invalid = Object.values(values).some((v) => v.trim() && !/^\d{1,14}([.,]\d{1,4})?$/.test(v.trim()));

  async function save() {
    setSaving(true);
    try {
      await productsApi.setPrices(
        p.id,
        p.prices.map((r) => ({
          priceListId: r.priceList.id,
          price: values[r.priceList.id]?.trim() ? values[r.priceList.id].trim().replace(',', '.') : null,
        })),
        p.hasVariants && applyToVariants,
      );
      toast('success', p.hasVariants && applyToVariants ? `Prices saved for ${p.variants.length + 1} products` : 'Prices saved');
      await onChange();
    } catch (e) {
      toast('error', (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card title="Price lists" icon={Tags} className="lg:col-span-2">
        <div className="divide-y divide-slate-100">
          <div className="flex items-center justify-between gap-4 px-5 py-4">
            <div>
              <p className="font-medium text-slate-800">Default sale price</p>
              <p className="text-xs text-slate-500">Used when a price list has no price — change it with Edit</p>
            </div>
            <p className="text-lg font-semibold text-slate-900 tabular-nums">{formatMoney(p.salePrice)}</p>
          </div>
          {p.prices.map((r, i) => {
            const v = values[r.priceList.id] ?? '';
            const diff = v.trim() ? (toNum(v.replace(',', '.')) / Math.max(toNum(p.salePrice), 0.0001) - 1) * 100 : null;
            return (
              <motion.div
                key={r.priceList.id}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.06 }}
                className="flex flex-wrap items-center justify-between gap-4 px-5 py-4"
              >
                <div>
                  <p className="font-medium text-slate-800">{r.priceList.name}</p>
                  <p className="font-mono text-xs text-slate-400">{r.priceList.code}</p>
                </div>
                <div className="flex items-center gap-3">
                  {diff !== null && Number.isFinite(diff) && Math.abs(diff) >= 0.05 && (
                    <span className={clsx('inline-flex items-center text-xs font-medium', diff < 0 ? 'text-amber-600' : 'text-emerald-600')}>
                      {diff < 0 ? <ArrowDownRight className="size-3.5" /> : <ArrowUpRight className="size-3.5" />}
                      {formatPct(Math.abs(diff))}
                    </span>
                  )}
                  <input
                    inputMode="decimal"
                    disabled={!canWrite}
                    value={v}
                    onChange={(e) => setValues((x) => ({ ...x, [r.priceList.id]: e.target.value }))}
                    placeholder={`${formatMoney(p.salePrice)} (default)`}
                    className={clsx(inputClass, 'w-40 text-right tabular-nums')}
                  />
                </div>
              </motion.div>
            );
          })}
        </div>
        {canWrite && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-4">
            {p.hasVariants ? (
              <label className="inline-flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" checked={applyToVariants} onChange={(e) => setApply(e.target.checked)} className="size-4 accent-emerald-600" />
                Also apply to all {p.variants.length} variants
              </label>
            ) : (
              <span />
            )}
            <Button variant="primary" icon={Save} loading={saving} disabled={invalid} onClick={save}>
              Save prices
            </Button>
          </div>
        )}
      </Card>
      <Card title="How prices work" icon={Coins} delay={0.1}>
        <ul className="space-y-2.5 p-5 text-sm text-slate-600">
          <li>Each customer can be linked to a price list (Retail or Wholesale).</li>
          <li className="text-xs text-slate-400">Applied automatically in quotations once the Sales module is built.</li>
          <li>On a quotation, the customer&apos;s list price is used; when the list has no price, the default sale price is used.</li>
          <li>Leave a field empty to remove the product from that list.</li>
        </ul>
      </Card>
    </div>
  );
}

// ───────────────────────────── Stock ─────────────────────────────

function StockTab({ p }: { p: ProductDetail }) {
  const max = Math.max(...p.stock.map((s) => toNum(s.quantity)), 1);
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card title="By warehouse" icon={Warehouse}>
        {p.stock.length === 0 ? (
          <EmptyState icon={Boxes} title="No stock yet" text="Stock appears after a goods receipt, an adjustment or opening balances." />
        ) : (
          <ul className="space-y-4 p-5">
            {p.stock.map((s, i) => (
              <li key={s.warehouse.id}>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-medium text-slate-800">{s.warehouse.name}</span>
                  <span className="tabular-nums">
                    {formatQty(s.quantity)} <span className="text-xs text-slate-400">{p.baseUnit.code}</span>
                  </span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.max(0, (toNum(s.quantity) / max) * 100)}%` }}
                    transition={{ delay: i * 0.08, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                    className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-500"
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="Recent movements" icon={CalendarClock} className="lg:col-span-2" delay={0.1}>
        {p.recentMoves.length === 0 ? (
          <EmptyState icon={CalendarClock} title="No movements yet" text="Receipts, deliveries, adjustments and transfers will be listed here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
                  <th className="py-3 pl-5">Date</th>
                  <th className="px-3 py-3">Type</th>
                  {p.hasVariants && <th className="px-3 py-3">SKU</th>}
                  <th className="px-3 py-3">Warehouse</th>
                  <th className="px-3 py-3 text-right">Qty</th>
                  <th className="py-3 pr-5">Reference</th>
                </tr>
              </thead>
              <tbody>
                {p.recentMoves.map((m) => (
                  <tr key={m.id} className="border-b border-slate-50 last:border-0">
                    <td className="py-2.5 pl-5 text-slate-500">{formatDateTime(m.createdAt)}</td>
                    <td className="px-3 py-2.5">
                      <Badge tone={toNum(m.quantity) >= 0 ? 'green' : 'amber'}>{m.type.replace('_', ' ').toLowerCase()}</Badge>
                    </td>
                    {p.hasVariants && <td className="px-3 py-2.5 font-mono text-xs">{m.sku}</td>}
                    <td className="px-3 py-2.5">{m.warehouse}</td>
                    <td className={clsx('px-3 py-2.5 text-right font-medium tabular-nums', toNum(m.quantity) >= 0 ? 'text-emerald-700' : 'text-amber-700')}>
                      {toNum(m.quantity) > 0 ? '+' : ''}
                      {formatQty(m.quantity)}
                    </td>
                    <td className="py-2.5 pr-5 text-slate-500">{m.reference ?? m.reason ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <Skeleton className="h-40 rounded-2xl" />
      <Skeleton className="h-10 w-96" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-32 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

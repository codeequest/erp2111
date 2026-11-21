'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import clsx from 'clsx';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  FileUp,
  Loader2,
  Search,
  Upload,
  X,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import {
  downloadCsv,
  fetchAllPages,
  fmtMoney,
  importPriceListPrices,
  listPriceListItems,
  setProductPrices,
  toNum,
  type Page,
  type PriceImportReport,
  type PriceList,
  type PriceListItem,
} from '@/lib/inventory';
import {
  Alert,
  PageHeader,
  ProductTabs,
  RequirePermission,
  btn,
  btnPrimary,
  inputBase,
} from '@/components/inventory/ui';

const PAGE_SIZE = 50;

export default function PriceListPage() {
  return (
    <RequirePermission permission="inventory.product.read">
      <PriceListPrices />
    </RequirePermission>
  );
}

function PriceListPrices() {
  const { id } = useParams<{ id: string }>();
  const canWrite = useAuth().can('inventory.product.write');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<(Page<PriceListItem> & { priceList: PriceList }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setQ(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(() => {
    listPriceListItems(id, { q, page, pageSize: PAGE_SIZE })
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, [id, q, page]);
  useEffect(load, [load]);

  const list = data?.priceList;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  async function exportCsv() {
    if (!list) return;
    setExporting(true);
    try {
      const all = await fetchAllPages((p) => listPriceListItems(id, { page: p, pageSize: 500 }));
      downloadCsv(
        `prices-${list.code.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`,
        ['sku', 'name', 'unit', 'retail_price', 'fixed_price', 'price'],
        all.map((i) => [i.sku, i.name, i.baseUnit.code, i.salePrice, i.fixedPrice, i.price]),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title={list ? `${list.name} prices` : 'Price list'}
        subtitle={
          list
            ? `Rule: ${Number(list.adjustmentPct) > 0 ? '+' : ''}${Number(list.adjustmentPct)} % vs retail. A fixed price replaces the rule.`
            : undefined
        }
        crumbs={[
          { label: 'Price lists', href: '/inventory/products/price-lists' },
          { label: list?.name ?? '…' },
        ]}
        actions={
          <>
            {canWrite && (
              <button className={btn} onClick={() => setShowImport(true)}>
                <Upload className="size-4" /> Import
              </button>
            )}
            <button
              className={btn}
              onClick={() => void exportCsv()}
              disabled={exporting || !data?.total}
            >
              {exporting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Download className="size-4" />
              )}
              Export
            </button>
          </>
        }
      />
      <ProductTabs />
      {error && <Alert>{error}</Alert>}

      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center gap-3 border-b border-slate-200 p-3">
          <div className="relative max-w-xs flex-1">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              aria-label="Search products"
              placeholder="Search SKU, name or barcode…"
              className={clsx(inputBase, 'w-full py-1.5 pl-9')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {canWrite && (
            <p className="ml-auto text-xs text-slate-500">
              Type a fixed price and press Enter; empty it to go back to the rule.
            </p>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-2.5">SKU</th>
                <th className="px-4 py-2.5">Product</th>
                <th className="px-4 py-2.5 text-right">Retail</th>
                <th className="px-4 py-2.5 text-right">Fixed price</th>
                <th className="px-4 py-2.5 text-right">{list?.name ?? 'Price'}</th>
                <th className="px-4 py-2.5 text-right">vs retail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {!data ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center">
                    <Loader2 className="mx-auto size-6 animate-spin text-slate-400" />
                  </td>
                </tr>
              ) : data.items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500">
                    No active product{q ? ' matches this search' : ''}.
                  </td>
                </tr>
              ) : (
                data.items.map((item) => (
                  <PriceRow
                    key={item.id}
                    item={item}
                    priceListId={id}
                    canWrite={canWrite}
                    onSaved={load}
                    onError={setError}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
        {data && data.total > PAGE_SIZE && (
          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm text-slate-600">
            <span>
              Page {data.page} of {totalPages}
            </span>
            <div className="flex gap-2">
              <button className={btn} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="size-4" /> Previous
              </button>
              <button
                className={btn}
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next <ChevronRight className="size-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {showImport && list && (
        <PriceImportDialog list={list} onClose={() => setShowImport(false)} onImported={load} />
      )}
    </div>
  );
}

function PriceRow({
  item,
  priceListId,
  canWrite,
  onSaved,
  onError,
}: {
  item: PriceListItem;
  priceListId: string;
  canWrite: boolean;
  onSaved: () => void;
  onError: (msg: string) => void;
}) {
  const initial = item.fixedPrice !== null ? String(Number(item.fixedPrice)) : '';
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);
  useEffect(() => setValue(initial), [initial]);

  const invalid = value.trim() !== '' && (Number.isNaN(toNum(value)) || toNum(value) < 0);
  async function save() {
    if (invalid || value === initial) return;
    setSaving(true);
    try {
      await setProductPrices(item.id, [{ priceListId, price: value.trim() ? toNum(value) : null }]);
      onSaved();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const diff =
    Number(item.salePrice) > 0 ? (Number(item.price) / Number(item.salePrice) - 1) * 100 : null;
  return (
    <tr>
      <td className="px-4 py-2 font-mono text-xs text-slate-600">{item.sku}</td>
      <td className="px-4 py-2 font-medium text-slate-900">{item.name}</td>
      <td className="px-4 py-2 text-right text-slate-600 tabular-nums">
        {fmtMoney(item.salePrice)}
      </td>
      <td className="px-4 py-2 text-right">
        {canWrite ? (
          <span className="inline-flex items-center gap-1">
            {saving && <Loader2 className="size-3.5 animate-spin text-slate-400" />}
            <input
              aria-label={`Fixed price of ${item.name}`}
              inputMode="decimal"
              placeholder="rule"
              className={clsx(inputBase, 'w-24 py-1 text-right', invalid && 'border-red-400')}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onBlur={() => void save()}
              onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
            />
          </span>
        ) : item.fixedPrice !== null ? (
          fmtMoney(item.fixedPrice)
        ) : (
          <span className="text-slate-400">rule</span>
        )}
      </td>
      <td
        className={clsx(
          'px-4 py-2 text-right tabular-nums',
          item.fixedPrice !== null && 'font-semibold',
        )}
      >
        {fmtMoney(item.price)}
      </td>
      <td className="px-4 py-2 text-right text-xs text-slate-500 tabular-nums">
        {diff === null ? '—' : `${diff > 0 ? '+' : ''}${diff.toFixed(1)} %`}
      </td>
    </tr>
  );
}

function PriceImportDialog({
  list,
  onClose,
  onImported,
}: {
  list: PriceList;
  onClose: () => void;
  onImported: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [csv, setCsv] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [report, setReport] = useState<PriceImportReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(text: string, dryRun: boolean) {
    setBusy(true);
    setError(null);
    try {
      const r = await importPriceListPrices(list.id, text, dryRun);
      setReport(r);
      if (r.saved) onImported();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal
    >
      <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="font-semibold text-slate-900">Import {list.name} prices</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-slate-400 hover:bg-slate-100"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="space-y-4 p-5 text-sm">
          <div className="text-slate-600">
            <p>
              Columns: <b>sku</b> and <b>price</b> (excl. VAT, per base unit). An empty price
              removes the fixed price, so the product follows the list rule again. Nothing is saved
              if a line has an error.
            </p>
            <button
              type="button"
              className="mt-2 inline-flex items-center gap-1 font-medium text-blue-600 hover:underline"
              onClick={() =>
                downloadCsv(
                  `prices-${list.code.toLowerCase()}-template.csv`,
                  ['sku', 'price'],
                  [['COCA-33CL', '1.35']],
                )
              }
            >
              <Download className="size-4" /> Download a template
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              setFileName(file.name);
              setReport(null);
              const text = await file.text();
              setCsv(text);
              await run(text, true);
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed border-slate-300 px-4 py-6 text-slate-500 hover:border-mod-inventory hover:text-mod-inventory"
          >
            <FileUp className="size-6" />
            {fileName ? `${fileName} — choose another file` : 'Choose a CSV file'}
          </button>
          {busy && (
            <p className="flex items-center gap-2 text-slate-500">
              <Loader2 className="size-4 animate-spin" /> Working…
            </p>
          )}
          {error && <Alert>{error}</Alert>}
          {report &&
            !busy &&
            (report.saved ? (
              <Alert kind="success">
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="size-4" /> {report.fixed} fixed price(s) set,{' '}
                  {report.cleared} back to the rule.
                </span>
              </Alert>
            ) : report.errors.length > 0 ? (
              <>
                <Alert>{report.errors.length} error(s) — nothing was saved.</Alert>
                <ul className="max-h-48 overflow-y-auto rounded-md border border-slate-200 text-xs">
                  {report.errors.map((er, i) => (
                    <li
                      key={i}
                      className="flex gap-3 border-b border-slate-100 px-3 py-1.5 last:border-0"
                    >
                      <span className="w-14 shrink-0 font-mono text-slate-400">line {er.line}</span>
                      <span className="text-red-700">{er.message}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700">
                File checked: <b>{report.fixed}</b> fixed price(s) to set, <b>{report.cleared}</b>{' '}
                to clear.
              </p>
            ))}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <button className={btn} onClick={onClose}>
            {report?.saved ? 'Close' : 'Cancel'}
          </button>
          {report && !report.saved && report.errors.length === 0 && csv && (
            <button className={btnPrimary} disabled={busy} onClick={() => void run(csv, false)}>
              Import
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

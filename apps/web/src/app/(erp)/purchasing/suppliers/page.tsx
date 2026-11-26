'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import {
  ArrowRight,
  Building2,
  ClipboardList,
  FileClock,
  Phone,
  Plus,
  Search,
  Truck,
} from 'lucide-react';
import type {
  Paginated,
  PurchaseOrderListItem,
  SupplierDetail,
  SupplierInput,
  SupplierListItem,
  SupplierLookups,
  SupplierStatusFilter,
  TaxRateRef,
} from '@erp/shared';
import { TN_RNE_PATTERN, TN_TAX_ID_PATTERN, normalizeRne } from '@erp/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import type { MessageKey } from '@/lib/messages';
import { AccessDenied } from '@/components/page-header';
import {
  EmptyState,
  ErrorBox,
  ExportButton,
  PoStatusBadge,
  Field,
  Modal,
  Pager,
  PurchasingHero,
  Spinner,
  StatTile,
  btnDanger,
  btnPrimary,
  btnSecondary,
  errorMessages,
  fieldClass,
  heroButton,
  inputClass,
  useSuccess,
} from '@/components/purchasing/ui';

const PAGE_SIZE = 25;
const STATUS_TABS: { key: SupplierStatusFilter; label: MessageKey }[] = [
  { key: 'active', label: 'common.active' },
  { key: 'inactive', label: 'common.inactive' },
  { key: 'all', label: 'common.all' },
];

export default function SuppliersPage() {
  const { can } = useAuth();
  const { t } = useI18n();
  const canRead = can('purchasing.supplier.read');
  const canWrite = can('purchasing.supplier.write');
  const canReadOrders = can('purchasing.order.read');

  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [status, setStatus] = useState<SupplierStatusFilter>('active');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Paginated<SupplierListItem> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | string[] | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [stats, setStats] = useState<{ active: number; open: number; drafts: number } | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (!canRead) return;
    let cancelled = false;
    setLoading(true);
    const qs = new URLSearchParams({ status, page: String(page), pageSize: String(PAGE_SIZE) });
    if (debounced) qs.set('search', debounced);
    api<Paginated<SupplierListItem>>(`/purchasing/suppliers?${qs}`)
      .then((res) => {
        if (cancelled) return;
        setData(res);
        setError(null);
      })
      .catch((e) => !cancelled && setError(errorMessages(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [canRead, status, page, debounced, reloadKey]);

  // Header figures: three tiny "total only" queries.
  useEffect(() => {
    if (!canRead) return;
    const total = (path: string) =>
      api<Paginated<unknown>>(path)
        .then((r) => r.total)
        .catch(() => 0);
    Promise.all([
      total('/purchasing/suppliers?status=active&pageSize=1'),
      canReadOrders ? total('/purchasing/orders?status=open&pageSize=1') : Promise.resolve(0),
      canReadOrders ? total('/purchasing/orders?status=DRAFT&pageSize=1') : Promise.resolve(0),
    ]).then(([active, open, drafts]) => setStats({ active, open, drafts }));
  }, [canRead, canReadOrders, reloadKey]);

  if (!canRead) {
    return <AccessDenied permission="purchasing.supplier.read" what={t('sup.title')} />;
  }

  const reload = () => setReloadKey((k) => k + 1);
  // The export downloads what the list shows (same status and search).
  const exportQuery = new URLSearchParams({
    status,
    ...(debounced && { search: debounced }),
  }).toString();

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PurchasingHero
        icon={Truck}
        title={t('sup.title')}
        subtitle={t('sup.subtitle')}
        crumb={[{ label: t('sup.title') }]}
        actions={
          <>
            <ExportButton
              onHero
              path={`/purchasing/suppliers/export?${exportQuery}`}
              fileName="suppliers.xlsx"
            />
            {canWrite && (
              <button className={heroButton} onClick={() => setEditing('new')}>
                <Plus className="size-4" /> {t('sup.new')}
              </button>
            )}
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile
          icon={Building2}
          label={t('sup.statActive')}
          value={stats?.active ?? null}
          delay={60}
        />
        <StatTile
          icon={ClipboardList}
          label={t('sup.statOpen')}
          value={stats?.open ?? null}
          tone="sky"
          delay={120}
        />
        <StatTile
          icon={FileClock}
          label={t('sup.statDrafts')}
          value={stats?.drafts ?? null}
          tone="slate"
          delay={180}
        />
      </div>

      <div
        className="animate-rise overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
        style={{ animationDelay: '200ms' }}
      >
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-3">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder={t('sup.search')}
              className={clsx(inputClass, 'pl-9')}
            />
          </div>
          <div className="flex rounded-lg bg-slate-100 p-1">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => {
                  setStatus(tab.key);
                  setPage(1);
                }}
                className={clsx(
                  'rounded-md px-3 py-1 text-sm font-medium transition',
                  status === tab.key
                    ? 'bg-white text-orange-700 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800',
                )}
              >
                {t(tab.label)}
              </button>
            ))}
          </div>
          {loading && <Spinner className="text-amber-500" />}
        </div>

        {error ? (
          <div className="p-4">
            <ErrorBox message={error} />
          </div>
        ) : data && data.items.length === 0 && !loading ? (
          <EmptyState
            icon={Truck}
            title={debounced || status !== 'active' ? t('sup.emptyMatch') : t('sup.emptyNone')}
            text={
              debounced || status !== 'active' ? t('sup.emptyMatchText') : t('sup.emptyNoneText')
            }
            action={
              canWrite &&
              !debounced && (
                <button className={btnPrimary} onClick={() => setEditing('new')}>
                  <Plus className="size-4" /> {t('sup.addFirst')}
                </button>
              )
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/80 text-left text-xs font-medium tracking-wide text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-2.5">{t('sup.col.code')}</th>
                  <th className="px-4 py-2.5">{t('sup.col.supplier')}</th>
                  <th className="hidden px-4 py-2.5 lg:table-cell">{t('sup.col.taxId')}</th>
                  <th className="hidden px-4 py-2.5 md:table-cell">{t('sup.col.phone')}</th>
                  <th className="hidden px-4 py-2.5 sm:table-cell">{t('sup.col.taxRate')}</th>
                  <th className="hidden px-4 py-2.5 text-right xl:table-cell">
                    {t('sup.col.terms')}
                  </th>
                  <th className="px-4 py-2.5 text-right">{t('sup.col.openOrders')}</th>
                  <th className="px-4 py-2.5">{t('sup.col.status')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data?.items.map((s, i) => (
                  <tr
                    key={s.id}
                    onClick={() => setEditing(s.id)}
                    style={{ animationDelay: `${Math.min(i, 12) * 35}ms` }}
                    className="animate-rise group cursor-pointer transition hover:bg-amber-50/50"
                  >
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{s.code}</td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-slate-900 transition group-hover:text-orange-700">
                        {s.name}
                      </span>
                      <p className="mt-0.5 text-xs text-slate-400">
                        {s.rne ? (
                          <>
                            RNE <span className="font-mono text-slate-500">{s.rne}</span>
                          </>
                        ) : (
                          s.email
                        )}
                      </p>
                    </td>
                    <td className="hidden px-4 py-3 font-mono text-xs whitespace-nowrap text-slate-600 lg:table-cell">
                      {s.taxId ?? <span className="text-slate-300">—</span>}
                    </td>
                    <td className="hidden px-4 py-3 whitespace-nowrap text-slate-600 md:table-cell">
                      {s.phone ? (
                        <span className="flex items-center gap-1.5">
                          <Phone className="size-3.5 text-slate-400" /> {s.phone}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="hidden px-4 py-3 sm:table-cell">
                      <TaxRateBadge rate={s.taxRate} />
                    </td>
                    <td className="hidden px-4 py-3 text-right whitespace-nowrap text-slate-600 xl:table-cell">
                      {s.paymentTermDays === 0
                        ? t('sup.cash')
                        : t('sup.days', { n: s.paymentTermDays })}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {s.openOrders > 0 ? (
                        <span className="inline-flex min-w-7 justify-center rounded-full bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-700 ring-1 ring-sky-600/20">
                          {s.openOrders}
                        </span>
                      ) : (
                        <span className="text-slate-300">0</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <ActiveBadge active={s.isActive} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data && data.total > 0 && (
          <Pager
            page={page}
            pageSize={PAGE_SIZE}
            total={data.total}
            rangeKey="pager.suppliers"
            onPage={setPage}
          />
        )}
      </div>

      <SupplierModal
        id={editing}
        canWrite={canWrite}
        canReadOrders={canReadOrders}
        onClose={() => setEditing(null)}
        onSaved={reload}
      />
    </div>
  );
}

// ── Create / edit ────────────────────────────────────────────────────────────

const EMPTY: Required<Omit<SupplierInput, 'isActive'>> = {
  code: '',
  name: '',
  rne: '',
  email: '',
  phone: '',
  address: '',
  taxId: '',
  taxRateId: '',
  paymentTermDays: 0,
  notes: '',
};

function SupplierModal({
  id,
  canWrite,
  canReadOrders,
  onClose,
  onSaved,
}: {
  id: string | 'new' | null;
  canWrite: boolean;
  canReadOrders: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = id === 'new';
  const [form, setForm] = useState(EMPTY);
  const [detail, setDetail] = useState<SupplierDetail | null>(null);
  const [recent, setRecent] = useState<PurchaseOrderListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | string[] | null>(null);
  const [touched, setTouched] = useState(false);
  const [taxRates, setTaxRates] = useState<TaxRateRef[]>([]);
  const { burst, celebrate } = useSuccess();
  const { t, money, date } = useI18n();

  useEffect(() => {
    if (!id) return;
    api<SupplierLookups>('/purchasing/suppliers/lookups')
      .then((l) => setTaxRates(l.taxRates))
      .catch(() => setTaxRates([]));
  }, [id]);

  useEffect(() => {
    setError(null);
    setTouched(false);
    setDetail(null);
    setRecent([]);
    if (!id) return;
    if (id === 'new') {
      setForm(EMPTY);
      return;
    }
    setLoading(true);
    api<SupplierDetail>(`/purchasing/suppliers/${id}`)
      .then((d) => {
        setDetail(d);
        setForm({
          code: d.code,
          name: d.name,
          rne: d.rne ?? '',
          email: d.email ?? '',
          phone: d.phone ?? '',
          address: d.address ?? '',
          taxId: d.taxId ?? '',
          taxRateId: d.taxRate?.id ?? '',
          paymentTermDays: d.paymentTermDays,
          notes: d.notes ?? '',
        });
      })
      .catch((e) => setError(errorMessages(e)))
      .finally(() => setLoading(false));
    if (canReadOrders) {
      api<Paginated<PurchaseOrderListItem>>(`/purchasing/orders?supplierId=${id}&pageSize=3`)
        .then((r) => setRecent(r.items))
        .catch(() => setRecent([]));
    }
  }, [id, canReadOrders]);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const nameError = touched && !form.name.trim() ? t('sup.f.nameErr') : null;
  const emailError =
    touched && form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)
      ? t('sup.f.emailErr')
      : null;

  const rne = normalizeRne(form.rne ?? '');
  const rneError = touched && rne && !TN_RNE_PATTERN.test(rne) ? t('sup.f.rneErr') : null;
  const taxId = (form.taxId ?? '').trim().toUpperCase();
  // Hints only (foreign suppliers have other formats): never blocks saving.
  const taxIdHint = !taxId
    ? t('sup.f.taxIdHint')
    : !TN_TAX_ID_PATTERN.test(taxId)
      ? t('sup.f.taxIdForeign')
      : rne && TN_RNE_PATTERN.test(rne) && taxId.replace(/\//g, '').slice(0, 8) !== rne
        ? t('sup.f.taxIdMismatch')
        : t('sup.f.taxIdOk');

  const close = useCallback(() => !saving && onClose(), [saving, onClose]);

  async function save(patch?: Partial<SupplierInput>) {
    setTouched(true);
    if (!patch && (!form.name.trim() || emailError || (rne && !TN_RNE_PATTERN.test(rne)))) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body: Partial<SupplierInput> = patch ?? {
        ...form,
        code: form.code.trim() || undefined,
        rne: rne || null,
        taxId: taxId || null,
        taxRateId: form.taxRateId || null,
      };
      if (isNew) {
        const created = await api<SupplierDetail>('/purchasing/suppliers', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        celebrate(t('sup.created', { code: created.code }), onClose);
      } else {
        await api<SupplierDetail>(`/purchasing/suppliers/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
        celebrate(
          patch?.isActive === false
            ? t('sup.deactivated')
            : patch?.isActive
              ? t('sup.reactivated')
              : t('sup.saved'),
          onClose,
        );
      }
      onSaved();
    } catch (e) {
      setError(errorMessages(e));
    } finally {
      setSaving(false);
    }
  }

  const readOnly = !canWrite;

  return (
    <>
      <Modal
        open={id !== null}
        onClose={close}
        wide
        title={isNew ? t('sup.modal.new') : (detail?.name ?? t('sup.modal.fallbackTitle'))}
        subtitle={
          isNew ? (
            t('sup.modal.newHint')
          ) : detail ? (
            <span className="flex items-center gap-2">
              <span className="font-mono text-xs">{detail.code}</span>
              <ActiveBadge active={detail.isActive} />
            </span>
          ) : null
        }
        footer={
          <>
            {!isNew && detail && canWrite && (
              <button
                className={clsx(detail.isActive ? btnDanger : btnSecondary, 'mr-auto')}
                disabled={saving}
                onClick={() => save({ isActive: !detail.isActive })}
              >
                {detail.isActive ? t('sup.deactivate') : t('sup.reactivate')}
              </button>
            )}
            <button className={btnSecondary} onClick={close} disabled={saving}>
              {readOnly ? t('common.close') : t('common.cancel')}
            </button>
            {!readOnly && (
              <button className={btnPrimary} onClick={() => save()} disabled={saving || loading}>
                {saving && <Spinner />}
                {isNew ? t('sup.create') : t('sup.save')}
              </button>
            )}
          </>
        }
      >
        {loading ? (
          <div className="grid place-items-center py-16">
            <Spinner className="size-6 text-amber-500" />
          </div>
        ) : (
          <div className="space-y-5">
            {error && <ErrorBox message={error} />}

            {detail && (
              <div className="grid gap-3 sm:grid-cols-3">
                <Figure label={t('sup.fig.open')} value={String(detail.openOrders)} />
                <Figure label={t('sup.fig.ordered')} value={money(detail.orderedTotal)} />
                <Figure
                  label={t('sup.fig.last')}
                  value={detail.lastOrderDate ? date(detail.lastOrderDate) : t('common.never')}
                />
              </div>
            )}

            <fieldset disabled={readOnly || saving} className="grid gap-4 sm:grid-cols-6">
              <SectionTitle className="sm:col-span-6">{t('sup.sec.identity')}</SectionTitle>
              <Field
                label={t('sup.f.code')}
                className="sm:col-span-2"
                hint={isNew ? t('common.optional') : undefined}
              >
                <input
                  value={form.code}
                  onChange={(e) => set('code', e.target.value.toUpperCase())}
                  placeholder="SUP-00001"
                  className={clsx(inputClass, 'font-mono')}
                />
              </Field>
              <Field label={t('sup.f.name')} className="sm:col-span-4" error={nameError}>
                <input
                  value={form.name}
                  onChange={(e) => set('name', e.target.value)}
                  placeholder={t('sup.f.namePh')}
                  autoFocus={isNew}
                  className={clsx(inputClass, nameError && 'border-red-400! animate-shake')}
                />
              </Field>
              <SectionTitle className="sm:col-span-6">{t('sup.sec.tax')}</SectionTitle>
              <Field
                label={t('sup.f.rne')}
                className="sm:col-span-2"
                error={rneError}
                hint={t('sup.f.rneHint')}
              >
                <input
                  value={form.rne ?? ''}
                  onChange={(e) => set('rne', e.target.value.toUpperCase())}
                  placeholder="1234567A"
                  maxLength={9}
                  className={clsx(
                    inputClass,
                    'font-mono',
                    rneError && 'animate-shake border-red-400!',
                  )}
                />
              </Field>
              <Field label={t('sup.f.taxId')} className="sm:col-span-2" hint={taxIdHint}>
                <input
                  value={form.taxId ?? ''}
                  onChange={(e) => set('taxId', e.target.value.toUpperCase())}
                  placeholder="1234567A/A/M/000"
                  className={clsx(inputClass, 'font-mono')}
                />
              </Field>
              <Field
                label={t('sup.f.taxRate')}
                className="sm:col-span-2"
                hint={form.taxRateId ? t('sup.f.taxRateHintSet') : t('sup.f.taxRateHintNone')}
              >
                <select
                  value={form.taxRateId ?? ''}
                  onChange={(e) => set('taxRateId', e.target.value)}
                  className={inputClass}
                >
                  <option value="">{t('sup.f.taxRateNone')}</option>
                  {taxRates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                  {detail?.taxRate && !taxRates.some((t) => t.id === detail.taxRate!.id) && (
                    <option value={detail.taxRate.id}>
                      {t('sup.f.taxRateInactive', { name: detail.taxRate.name })}
                    </option>
                  )}
                </select>
              </Field>

              <SectionTitle className="sm:col-span-6">{t('sup.sec.contact')}</SectionTitle>
              <Field label={t('sup.f.phone')} className="sm:col-span-3">
                <input
                  type="tel"
                  value={form.phone ?? ''}
                  onChange={(e) => set('phone', e.target.value)}
                  placeholder="+216 71 000 000"
                  className={inputClass}
                />
              </Field>
              <Field label={t('sup.f.email')} className="sm:col-span-3" error={emailError}>
                <input
                  type="email"
                  value={form.email ?? ''}
                  onChange={(e) => set('email', e.target.value)}
                  placeholder="orders@supplier.com"
                  className={clsx(inputClass, emailError && 'border-red-400!')}
                />
              </Field>
              <Field label={t('sup.f.address')} className="sm:col-span-6">
                <textarea
                  rows={2}
                  value={form.address ?? ''}
                  onChange={(e) => set('address', e.target.value)}
                  placeholder={t('sup.f.addressPh')}
                  className={inputClass}
                />
              </Field>

              <SectionTitle className="sm:col-span-6">{t('sup.sec.terms')}</SectionTitle>
              <Field label={t('sup.f.terms')} className="sm:col-span-3" hint={t('sup.f.termsHint')}>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={365}
                    value={form.paymentTermDays}
                    onChange={(e) => set('paymentTermDays', Math.max(0, Number(e.target.value)))}
                    className={clsx(fieldClass, 'w-28 text-right')}
                  />
                  <span className="text-sm text-slate-500">{t('sup.f.daysUnit')}</span>
                  <div className="ml-auto flex gap-1">
                    {[0, 30, 60].map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => set('paymentTermDays', d)}
                        className={clsx(
                          'rounded-md px-2 py-1 text-xs font-medium ring-1 transition',
                          form.paymentTermDays === d
                            ? 'bg-amber-50 text-orange-700 ring-amber-500/40'
                            : 'text-slate-500 ring-slate-200 hover:bg-slate-50',
                        )}
                      >
                        {d === 0 ? t('sup.cash') : t('sup.days', { n: d })}
                      </button>
                    ))}
                  </div>
                </div>
              </Field>
              <Field label={t('sup.f.notes')} className="sm:col-span-6">
                <textarea
                  rows={2}
                  value={form.notes ?? ''}
                  onChange={(e) => set('notes', e.target.value)}
                  className={inputClass}
                />
              </Field>
            </fieldset>

            {!isNew && canReadOrders && (
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-800">{t('sup.recent')}</h3>
                  <Link
                    href={`/purchasing/orders?supplierId=${id}`}
                    className="inline-flex items-center gap-1 text-xs font-medium text-orange-700 hover:underline"
                  >
                    {t('sup.allOrders')} <ArrowRight className="size-3.5" />
                  </Link>
                </div>
                {recent.length === 0 ? (
                  <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-500">
                    {t('sup.noOrders')}
                  </p>
                ) : (
                  <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                    {recent.map((o) => (
                      <li key={o.id}>
                        <Link
                          href={`/purchasing/orders/${o.id}`}
                          className="flex items-center justify-between gap-3 px-3 py-2 text-sm transition hover:bg-amber-50/50"
                        >
                          <span className="font-mono text-xs font-medium">{o.number}</span>
                          <span className="text-slate-500">{date(o.orderDate)}</span>
                          <span className="ml-auto tabular-nums">{money(o.total)}</span>
                          <PoStatusBadge status={o.status} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>
      {burst}
    </>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-gradient-to-br from-amber-50 to-orange-50 px-3 py-2.5 ring-1 ring-amber-500/15">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="font-semibold text-slate-900 tabular-nums">{value}</p>
    </div>
  );
}

function SectionTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <h3
      className={clsx(
        '-mb-1 flex items-center gap-2 text-xs font-semibold tracking-wide text-orange-700 uppercase',
        className,
      )}
    >
      {children}
      <span className="h-px flex-1 bg-gradient-to-r from-amber-200 to-transparent" />
    </h3>
  );
}

/** Active / inactive chip in the chosen language. */
function ActiveBadge({ active }: { active: boolean }) {
  const { t } = useI18n();
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1',
        active
          ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'
          : 'bg-slate-100 text-slate-600 ring-slate-500/20',
      )}
    >
      {active ? t('common.active') : t('common.inactive')}
    </span>
  );
}

/** Tax rate chip: amber for a VAT rate, emerald for 0 % (exempt / suspension). */
function TaxRateBadge({ rate }: { rate: TaxRateRef | null }) {
  const { t } = useI18n();
  if (!rate) return <span className="text-xs text-slate-400">{t('sup.productRate')}</span>;
  const zero = Number(rate.rate) === 0;
  return (
    <span
      title={rate.name}
      className={clsx(
        'inline-flex max-w-44 items-center truncate rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1',
        zero
          ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'
          : 'bg-amber-50 text-orange-800 ring-amber-600/25',
      )}
    >
      {rate.name}
    </span>
  );
}

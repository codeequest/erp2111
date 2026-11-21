'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import {
  AlertTriangle,
  Building2,
  ChevronRight,
  FileText,
  Hash,
  Lock,
  Package,
  Pencil,
  Percent,
  RefreshCw,
  Settings,
} from 'lucide-react';
import type { SequenceSetting } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { settingsApi } from '@/lib/settings';
import { SequenceDialog } from '@/components/settings/sequence-dialog';

type Tab = 'numbering' | 'company' | 'taxes';

const TABS: { key: Tab; label: string; icon: typeof Hash; ready: boolean }[] = [
  { key: 'numbering', label: 'Numbering', icon: Hash, ready: true },
  { key: 'company', label: 'Company details', icon: Building2, ready: false },
  { key: 'taxes', label: 'Taxes', icon: Percent, ready: false },
];

export default function SettingsPage() {
  const { can } = useAuth();
  const [tab, setTab] = useState<Tab>('numbering');

  if (!can('admin.settings.manage')) {
    return (
      <div className="mx-auto mt-16 max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center">
        <Lock className="mx-auto size-8 text-slate-400" />
        <h1 className="mt-3 text-lg font-semibold text-slate-900">Access denied</h1>
        <p className="mt-1 text-sm text-slate-500">
          Settings need the <code className="rounded bg-slate-100 px-1">admin.settings.manage</code>{' '}
          permission. Ask an administrator.
        </p>
        <Link
          href="/dashboard"
          className="mt-5 inline-block text-sm font-medium text-blue-600 hover:underline"
        >
          Back to dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Header */}
      <div className="animate-fade-in-up">
        <nav className="flex items-center gap-1 text-xs text-slate-500" aria-label="Breadcrumb">
          <Link href="/dashboard" className="hover:text-slate-700">
            Home
          </Link>
          <ChevronRight className="size-3" />
          <span className="text-mod-admin">Administration</span>
          <ChevronRight className="size-3" />
          <span>Settings</span>
        </nav>
        <div className="mt-2 flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-xl bg-gradient-to-br from-slate-600 to-slate-800 shadow-sm">
            <Settings className="size-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Settings</h1>
            <p className="text-sm text-slate-500">How the ERP works for your company</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div
        className="animate-fade-in-up flex gap-1 overflow-x-auto border-b border-slate-200"
        style={{ animationDelay: '40ms' }}
        role="tablist"
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            disabled={!t.ready}
            onClick={() => setTab(t.key)}
            className={clsx(
              '-mb-px flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm transition',
              tab === t.key
                ? 'border-slate-800 font-medium text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-800',
              !t.ready && 'cursor-not-allowed opacity-60 hover:text-slate-500',
            )}
          >
            <t.icon className="size-4" />
            {t.label}
            {!t.ready && (
              <span className="rounded-full bg-slate-100 px-1.5 py-px text-[10px] font-medium text-slate-500">
                Soon
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === 'numbering' && <NumberingTab />}
    </div>
  );
}

function NumberingTab() {
  const [sequences, setSequences] = useState<SequenceSetting[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<SequenceSetting | null>(null);
  const [justSaved, setJustSaved] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    settingsApi
      .listSequences()
      .then(setSequences)
      .catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-white px-6 py-14 text-center">
        <AlertTriangle className="size-8 text-rose-500" />
        <p className="text-sm text-slate-600">Could not load the numbering settings: {error}</p>
        <button
          onClick={load}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
        >
          <RefreshCw className="size-4" /> Try again
        </button>
      </div>
    );
  }

  const products = sequences?.filter((s) => s.type === 'PRODUCT') ?? [];
  const documents = sequences?.filter((s) => s.type !== 'PRODUCT') ?? [];
  const year = documents[0]?.year ?? new Date().getFullYear();

  return (
    <div className="space-y-6">
      <Section
        icon={Package}
        title="Product codes"
        description="Given automatically to new products when no code is typed by hand. Never restarts."
        delay={80}
      >
        {sequences ? (
          products.map((s) => (
            <Row key={s.id} s={s} highlight={justSaved === s.id} onEdit={() => setEditing(s)} />
          ))
        ) : (
          <SkeletonRows count={1} />
        )}
      </Section>

      <Section
        icon={FileText}
        title={`Documents · ${year}`}
        description="Each document type has its own numbers, restarting every year. Numbers only move forward, so no number is ever used twice."
        delay={140}
      >
        {sequences ? (
          documents.map((s) => (
            <Row key={s.id} s={s} highlight={justSaved === s.id} onEdit={() => setEditing(s)} />
          ))
        ) : (
          <SkeletonRows count={6} />
        )}
      </Section>

      {editing && (
        <SequenceDialog
          sequence={editing}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            setSequences((list) => list?.map((s) => (s.id === saved.id ? saved : s)) ?? null);
            setEditing(null);
            setJustSaved(saved.id);
            setTimeout(() => setJustSaved(null), 1800);
          }}
        />
      )}
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  description,
  delay,
  children,
}: {
  icon: typeof Hash;
  title: string;
  description: string;
  delay: number;
  children: React.ReactNode;
}) {
  return (
    <section
      className="animate-fade-in-up overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-start gap-3 border-b border-slate-100 p-5">
        <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600">
          <Icon className="size-4" />
        </div>
        <div>
          <h2 className="font-semibold text-slate-900">{title}</h2>
          <p className="text-sm text-slate-500">{description}</p>
        </div>
      </div>
      <ul className="divide-y divide-slate-100">{children}</ul>
    </section>
  );
}

function Row({
  s,
  highlight,
  onEdit,
}: {
  s: SequenceSetting;
  highlight: boolean;
  onEdit: () => void;
}) {
  return (
    <li
      className={clsx(
        'flex items-center gap-4 px-5 py-3 transition-colors duration-700',
        highlight ? 'bg-emerald-50' : 'hover:bg-slate-50',
      )}
    >
      <span className="min-w-0 flex-1 text-sm font-medium text-slate-800">{s.label}</span>
      <span className="hidden text-xs text-slate-400 sm:inline">Next</span>
      <span className="rounded-md bg-slate-100 px-2 py-1 font-mono text-sm text-slate-800 tabular-nums">
        {s.nextValue}
      </span>
      <button
        onClick={onEdit}
        className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
        aria-label={`Edit ${s.label} numbering`}
      >
        <Pencil className="size-4" />
        <span className="hidden sm:inline">Edit</span>
      </button>
    </li>
  );
}

function SkeletonRows({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <li key={i} className="flex items-center gap-4 px-5 py-3.5">
          <div className="h-3.5 w-40 animate-pulse rounded bg-slate-100" />
          <div className="ml-auto h-6 w-32 animate-pulse rounded bg-slate-100" />
        </li>
      ))}
    </>
  );
}

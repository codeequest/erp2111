'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import {
  ChevronRight,
  CornerDownRight,
  FolderPlus,
  FolderTree,
  Loader2,
  Pencil,
  Plus,
  Power,
  RotateCcw,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { inventoryApi, type Category } from '@/lib/inventory';
import {
  AccessDenied,
  Breadcrumb,
  ErrorNotice,
  Field,
  Modal,
  StatusPill,
  btn,
  inputCls,
} from '@/components/inventory/ui';

type Editing = { mode: 'create'; parentId: string | null } | { mode: 'edit'; category: Category };

export default function CategoriesPage() {
  const { can } = useAuth();
  const canRead = can('inventory.product.read');
  const canWrite = can('inventory.product.write');

  const [categories, setCategories] = useState<Category[] | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      setCategories(await inventoryApi.listCategories(showInactive));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [showInactive]);

  useEffect(() => {
    if (canRead) void load();
  }, [canRead, load]);

  // Hide the descendants of collapsed categories (the list is already in tree order).
  const visible = useMemo(() => {
    if (!categories) return [];
    const out: Category[] = [];
    let hideBelow: number | null = null;
    for (const c of categories) {
      if (hideBelow !== null && c.depth > hideBelow) continue;
      hideBelow = collapsed.has(c.id) ? c.depth : null;
      out.push(c);
    }
    return out;
  }, [categories, collapsed]);

  if (!canRead) return <AccessDenied permission="inventory.product.read" what="open categories" />;

  const toggle = (id: string) =>
    setCollapsed((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const setActive = async (c: Category) => {
    if (
      c.isActive &&
      !confirm(`Deactivate "${c.name}"${c.childCount ? ' and hide its subcategories' : ''}?`)
    )
      return;
    setBusyId(c.id);
    try {
      await inventoryApi.updateCategory(c.id, { isActive: !c.isActive });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const mains = categories?.filter((c) => c.depth === 0).length ?? 0;
  const subs = (categories?.length ?? 0) - mains;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <Breadcrumb
          items={[
            { label: 'Inventory' },
            { label: 'Products', href: '/inventory/products' },
            { label: 'Categories' },
          ]}
        />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-lg bg-mod-inventory/10">
              <FolderTree className="size-5 text-mod-inventory" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">Categories</h1>
              <p className="text-sm text-slate-500">
                {categories
                  ? `${mains} main categories · ${subs} subcategories`
                  : 'Group products in a tree'}
              </p>
            </div>
          </div>
          {canWrite && (
            <button
              className={btn.primary}
              onClick={() => setEditing({ mode: 'create', parentId: null })}
            >
              <Plus className="size-4" /> New category
            </button>
          )}
        </div>
      </div>

      {error && <ErrorNotice message={error} onClose={() => setError(null)} />}

      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="size-4 rounded border-slate-300 accent-emerald-600"
            />
            Show inactive
          </label>
          <span className="text-xs text-slate-400">
            Product counts include active products only
          </span>
        </div>

        {!categories ? (
          <div className="grid place-items-center py-16 text-slate-400">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : categories.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-16 text-center">
            <FolderTree className="size-8 text-slate-300" />
            <h2 className="mt-3 font-semibold text-slate-900">No categories yet</h2>
            <p className="mt-1 max-w-sm text-sm text-slate-500">
              Start with main categories (e.g. Food, Hardware), then add subcategories inside them.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {visible.map((c) => (
              <li
                key={c.id}
                className={clsx(
                  'flex items-center gap-2 py-2 pr-3 hover:bg-slate-50',
                  !c.isActive && 'opacity-60',
                )}
                style={{ paddingLeft: `${12 + c.depth * 24}px` }}
              >
                {c.childCount > 0 ? (
                  <button
                    onClick={() => toggle(c.id)}
                    className="rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                    aria-label={collapsed.has(c.id) ? `Expand ${c.name}` : `Collapse ${c.name}`}
                    aria-expanded={!collapsed.has(c.id)}
                  >
                    <ChevronRight
                      className={clsx(
                        'size-4 transition-transform',
                        !collapsed.has(c.id) && 'rotate-90',
                      )}
                    />
                  </button>
                ) : c.depth > 0 ? (
                  <CornerDownRight className="mx-0.5 size-4 text-slate-300" />
                ) : (
                  <span className="w-5" />
                )}
                <Link
                  href={`/inventory/products?category=${c.id}`}
                  className={clsx(
                    'min-w-0 flex-1 truncate text-sm hover:text-emerald-700',
                    c.depth === 0 ? 'font-medium text-slate-900' : 'text-slate-700',
                  )}
                  title={`Show products in ${c.path}`}
                >
                  {c.name}
                </Link>
                {!c.isActive && <StatusPill active={false} />}
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 tabular-nums">
                  {c.productCount} {c.productCount === 1 ? 'product' : 'products'}
                </span>
                {canWrite && (
                  <div className="flex items-center">
                    <button
                      className={btn.ghost}
                      onClick={() => setEditing({ mode: 'create', parentId: c.id })}
                      title="Add subcategory"
                      aria-label={`Add a subcategory to ${c.name}`}
                      disabled={!c.isActive}
                    >
                      <FolderPlus className="size-4" />
                    </button>
                    <button
                      className={btn.ghost}
                      onClick={() => setEditing({ mode: 'edit', category: c })}
                      title="Rename or move"
                      aria-label={`Edit ${c.name}`}
                    >
                      <Pencil className="size-4" />
                    </button>
                    <button
                      className={clsx(
                        btn.ghost,
                        c.isActive ? 'hover:text-red-600' : 'hover:text-emerald-700',
                      )}
                      onClick={() => setActive(c)}
                      disabled={busyId === c.id}
                      title={c.isActive ? 'Deactivate' : 'Re-activate'}
                      aria-label={`${c.isActive ? 'Deactivate' : 'Re-activate'} ${c.name}`}
                    >
                      {busyId === c.id ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : c.isActive ? (
                        <Power className="size-4" />
                      ) : (
                        <RotateCcw className="size-4" />
                      )}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <CategoryDialog
        editing={editing}
        categories={categories ?? []}
        onClose={() => setEditing(null)}
        onSaved={async () => {
          setEditing(null);
          await load();
        }}
      />
    </div>
  );
}

function CategoryDialog({
  editing,
  categories,
  onClose,
  onSaved,
}: {
  editing: Editing | null;
  categories: Category[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setError(null);
    if (editing?.mode === 'edit') {
      setName(editing.category.name);
      setParentId(editing.category.parentId ?? '');
    } else if (editing) {
      setName('');
      setParentId(editing.parentId ?? '');
    }
  }, [editing]);

  // A category cannot move under itself or one of its own subcategories.
  const parentChoices = useMemo(() => {
    if (editing?.mode !== 'edit') return categories.filter((c) => c.isActive);
    const self = editing.category;
    const blocked = new Set([self.id]);
    for (const c of categories) if (c.parentId && blocked.has(c.parentId)) blocked.add(c.id);
    return categories.filter((c) => !blocked.has(c.id) && c.isActive);
  }, [categories, editing]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError('Enter a name');
    setBusy(true);
    setError(null);
    try {
      const body = { name: name.trim(), parentId: parentId || null };
      if (editing?.mode === 'edit') await inventoryApi.updateCategory(editing.category.id, body);
      else await inventoryApi.createCategory(body);
      await onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const title =
    editing?.mode === 'edit'
      ? 'Edit category'
      : editing?.parentId
        ? 'New subcategory'
        : 'New category';

  return (
    <Modal title={title} open={!!editing} onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        {error && <ErrorNotice message={error} />}
        <Field label="Name" htmlFor="cat-name" required>
          <input
            id="cat-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            className={inputCls}
          />
        </Field>
        <Field label="Parent category" htmlFor="cat-parent" hint="Leave empty for a main category">
          <select
            id="cat-parent"
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
            className={inputCls}
          >
            <option value="">— None (main category) —</option>
            {parentChoices.map((c) => (
              <option key={c.id} value={c.id}>
                {c.path}
              </option>
            ))}
          </select>
        </Field>
        <div className="flex justify-end gap-2">
          <button type="button" className={btn.secondary} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={btn.primary} disabled={busy}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            {editing?.mode === 'edit' ? 'Save' : 'Create'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

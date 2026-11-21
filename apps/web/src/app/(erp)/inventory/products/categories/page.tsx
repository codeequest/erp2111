'use client';

import { useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import { Check, Download, FolderTree, Loader2, Pencil, Plus, Upload, X } from 'lucide-react';
import { SimpleImportDialog, type SimpleImportConfig } from '@/components/simple-import-dialog';
import { useAuth } from '@/lib/auth';
import {
  createCategory,
  downloadCsv,
  flattenCategories,
  listCategories,
  updateCategory,
  type CategoryNode,
} from '@/lib/inventory';
import {
  Alert,
  PageHeader,
  ProductTabs,
  RequirePermission,
  StatusBadge,
  btn,
  btnPrimary,
  input,
  inputBase,
} from '@/components/inventory/ui';

export default function CategoriesPage() {
  return (
    <RequirePermission permission="inventory.product.read">
      <Categories />
    </RequirePermission>
  );
}

function Categories() {
  const { can } = useAuth();
  const canWrite = can('inventory.product.write');
  const [tree, setTree] = useState<CategoryNode[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState('');
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<{ id: string; name: string; parentId: string } | null>(
    null,
  );

  const load = useCallback(() => {
    listCategories()
      .then(setTree)
      .catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  async function run(action: () => Promise<unknown>) {
    setSaving(true);
    setError(null);
    try {
      await action();
      load();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setSaving(false);
    }
  }

  const flat = tree ? flattenCategories(tree) : [];
  const [showImport, setShowImport] = useState(false);

  // Parents must come before their children in the file (or already exist).
  const importConfig: SimpleImportConfig<{ name: string; parent: string | null }> = {
    title: 'Import categories',
    help: (
      <p>
        Columns: <b>name</b> (or nom) and optionally <b>parent</b> — the name of the parent
        category, which must exist or appear on an earlier line.
      </p>
    ),
    templateName: 'categories-template.csv',
    templateHeader: ['name', 'parent'],
    templateRows: [
      ['Beverages', ''],
      ['Soft drinks', 'Beverages'],
      ['Water', 'Beverages'],
    ],
    parseRow: (r) => {
      const n = r.name ?? r.nom ?? r.category ?? r.categorie ?? '';
      if (!n) return 'name is missing';
      return { name: n, parent: (r.parent ?? r.parente ?? r.categorie_parente ?? '') || null };
    },
    label: (i) => (i.parent ? `${i.parent} › ${i.name}` : i.name),
    save: async (i) => {
      const all = flattenCategories(await listCategories());
      const lower = (v: string) => v.toLowerCase();
      let parentId: string | null = null;
      if (i.parent) {
        const parent = all.find((c) => lower(c.name) === lower(i.parent!));
        if (!parent) throw new Error(`parent "${i.parent}" does not exist`);
        parentId = parent.id;
      }
      if (all.some((c) => lower(c.name) === lower(i.name) && c.parentId === parentId)) {
        return 'skipped';
      }
      await createCategory(i.name, parentId);
      return 'created';
    },
  };

  function exportCsv() {
    const byId = new Map(flat.map((c) => [c.id, c]));
    downloadCsv(
      `categories-${new Date().toISOString().slice(0, 10)}.csv`,
      ['name', 'parent', 'path', 'products', 'active'],
      flat.map((c) => [
        c.name,
        c.parentId ? (byId.get(c.parentId)?.name ?? '') : '',
        c.path,
        c.productCount,
        c.isActive ? 'yes' : 'no',
      ]),
    );
  }

  /** Ids that cannot be chosen as the new parent of `id` (itself and its sub-categories). */
  function blockedParents(id: string): Set<string> {
    const blocked = new Set([id]);
    for (const c of flat) if (c.parentId && blocked.has(c.parentId)) blocked.add(c.id);
    return blocked;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="Categories"
        subtitle="Group products, with sub-categories"
        crumbs={[{ label: 'Categories' }]}
        actions={
          <>
            {canWrite && (
              <button className={btn} onClick={() => setShowImport(true)}>
                <Upload className="size-4" /> Import
              </button>
            )}
            <button className={btn} onClick={exportCsv} disabled={flat.length === 0}>
              <Download className="size-4" /> Export
            </button>
          </>
        }
      />
      <ProductTabs />

      {error && <Alert>{error}</Alert>}

      {canWrite && (
        <form
          className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!name.trim()) return;
            if (await run(() => createCategory(name.trim(), parentId || null))) setName('');
          }}
        >
          <label className="min-w-48 flex-1">
            <span className="mb-1 block text-sm font-medium text-slate-700">New category</span>
            <input
              className={input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Beverages"
            />
          </label>
          <label className="min-w-48">
            <span className="mb-1 block text-sm font-medium text-slate-700">Inside</span>
            <select
              className={input}
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
            >
              <option value="">— Top level —</option>
              {flat.map((c) => (
                <option key={c.id} value={c.id}>
                  {'  '.repeat(c.depth)}
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <button className={btnPrimary} disabled={saving || !name.trim()}>
            <Plus className="size-4" /> Add
          </button>
        </form>
      )}

      <div className="rounded-xl border border-slate-200 bg-white">
        {!tree ? (
          <Loader2 className="mx-auto my-12 size-6 animate-spin text-slate-400" />
        ) : flat.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <FolderTree className="mx-auto size-8 text-slate-300" />
            <p className="mt-3 font-medium text-slate-900">No categories yet</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-2.5">Name</th>
                <th className="px-4 py-2.5 text-right">Products</th>
                <th className="px-4 py-2.5">Status</th>
                {canWrite && <th className="px-4 py-2.5" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {flat.map((c) =>
                editing?.id === c.id ? (
                  <tr key={c.id} className="bg-slate-50">
                    <td className="px-4 py-2" colSpan={3}>
                      <div className="flex flex-wrap gap-2">
                        <input
                          className={clsx(input, 'max-w-xs py-1.5')}
                          value={editing.name}
                          autoFocus
                          aria-label="Category name"
                          onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                        />
                        <select
                          className={clsx(inputBase, 'py-1.5')}
                          value={editing.parentId}
                          aria-label="Parent category"
                          onChange={(e) => setEditing({ ...editing, parentId: e.target.value })}
                        >
                          <option value="">— Top level —</option>
                          {flat
                            .filter((o) => !blockedParents(c.id).has(o.id))
                            .map((o) => (
                              <option key={o.id} value={o.id}>
                                {'  '.repeat(o.depth)}
                                {o.name}
                              </option>
                            ))}
                        </select>
                      </div>
                    </td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      <button
                        aria-label="Save"
                        disabled={saving || !editing.name.trim()}
                        className="rounded p-1.5 text-emerald-600 hover:bg-emerald-50"
                        onClick={async () => {
                          if (
                            await run(() =>
                              updateCategory(c.id, {
                                name: editing.name.trim(),
                                parentId: editing.parentId || null,
                              }),
                            )
                          )
                            setEditing(null);
                        }}
                      >
                        <Check className="size-4" />
                      </button>
                      <button
                        aria-label="Cancel"
                        className="rounded p-1.5 text-slate-400 hover:bg-slate-100"
                        onClick={() => setEditing(null)}
                      >
                        <X className="size-4" />
                      </button>
                    </td>
                  </tr>
                ) : (
                  <tr key={c.id} className={clsx(!c.isActive && 'text-slate-400')}>
                    <td className="px-4 py-2.5" style={{ paddingLeft: `${1 + c.depth * 1.5}rem` }}>
                      {c.depth > 0 && <span className="mr-1 text-slate-300">└</span>}
                      <span className="font-medium">{c.name}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{c.productCount}</td>
                    <td className="px-4 py-2.5">
                      <StatusBadge active={c.isActive} />
                    </td>
                    {canWrite && (
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        <button
                          className="mr-3 inline-flex items-center gap-1 text-slate-500 hover:text-slate-800"
                          onClick={() =>
                            setEditing({ id: c.id, name: c.name, parentId: c.parentId ?? '' })
                          }
                        >
                          <Pencil className="size-3.5" /> Edit
                        </button>
                        <button
                          className="text-slate-500 hover:text-slate-800"
                          disabled={saving}
                          onClick={() =>
                            void run(() => updateCategory(c.id, { isActive: !c.isActive }))
                          }
                        >
                          {c.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                      </td>
                    )}
                  </tr>
                ),
              )}
            </tbody>
          </table>
        )}
      </div>
      {showImport && (
        <SimpleImportDialog
          config={importConfig}
          onClose={() => setShowImport(false)}
          onDone={load}
        />
      )}
    </div>
  );
}

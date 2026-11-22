'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import { FolderTree, Pencil, Plus, Ruler } from 'lucide-react';
import type { CategoryDto, UnitDto } from '@erp/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { PermissionGate } from '@/components/permission-gate';
import {
  Badge,
  Breadcrumbs,
  Button,
  Card,
  ErrorBox,
  Field,
  Modal,
  PageLoader,
  inputClass,
  useToast,
} from '@/components/ui';

export default function CategoriesAndUnitsPage() {
  return (
    <PermissionGate permission="inventory.product.read">
      <div className="mx-auto max-w-6xl space-y-5">
        <div>
          <Breadcrumbs
            items={[
              { label: 'Home', href: '/dashboard' },
              { label: 'Inventory' },
              { label: 'Products', href: '/inventory/products' },
              { label: 'Categories & units' },
            ]}
          />
          <h1 className="mt-2 text-2xl font-semibold text-slate-900">Categories &amp; units</h1>
          <p className="text-sm text-slate-500">
            Organise the catalogue and define how products are counted.
          </p>
        </div>
        <div className="grid gap-5 lg:grid-cols-[3fr_2fr]">
          <Categories />
          <Units />
        </div>
      </div>
    </PermissionGate>
  );
}

// ── Categories ───────────────────────────────────────────────────────────────

interface CategoryEdit {
  id: string | null;
  name: string;
  parentId: string;
  isActive: boolean;
}

function Categories() {
  const { can } = useAuth();
  const toast = useToast();
  const canWrite = can('inventory.product.write');
  const [rows, setRows] = useState<CategoryDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [edit, setEdit] = useState<CategoryEdit | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setError(null);
    api<CategoryDto[]>('/inventory/categories?includeInactive=true')
      .then(setRows)
      .catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const save = async () => {
    if (!edit) return;
    if (!edit.name.trim()) {
      setFormError('Name is required');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const body = {
        name: edit.name.trim(),
        parentId: edit.parentId || null,
        ...(edit.id ? { isActive: edit.isActive } : {}),
      };
      await api(edit.id ? `/inventory/categories/${edit.id}` : '/inventory/categories', {
        method: edit.id ? 'PATCH' : 'POST',
        body: JSON.stringify(body),
      });
      toast(edit.id ? 'Category updated' : `Category “${body.name}” created`);
      setEdit(null);
      load();
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  // A category cannot be moved under itself or one of its sub-categories.
  const editingPath = edit?.id ? rows?.find((r) => r.id === edit.id)?.path : undefined;
  const parentOptions = (rows ?? []).filter(
    (r) =>
      r.isActive &&
      (!editingPath || (r.path !== editingPath && !r.path.startsWith(editingPath + ' / '))),
  );

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <FolderTree className="size-4 text-slate-400" /> Categories
        </span>
      }
      actions={
        canWrite && (
          <Button
            size="sm"
            variant="primary"
            onClick={() => {
              setFormError(null);
              setEdit({ id: null, name: '', parentId: '', isActive: true });
            }}
          >
            <Plus className="size-3.5" /> New category
          </Button>
        )
      }
    >
      {error ? (
        <ErrorBox message={error} onRetry={load} />
      ) : !rows ? (
        <PageLoader />
      ) : rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">
          No categories yet. Create one, e.g. “Clothing”, then “T-shirts” inside it.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {rows.map((c) => {
            const depth = c.path.split(' / ').length - 1;
            return (
              <li key={c.id} className="flex items-center gap-3 py-2 text-sm">
                <span
                  className={clsx('flex-1', !c.isActive && 'text-slate-400')}
                  style={{ paddingLeft: `${depth * 1.25}rem` }}
                >
                  {depth > 0 && <span className="mr-1 text-slate-300">└</span>}
                  {c.name}
                  {!c.isActive && (
                    <span className="ml-2">
                      <Badge tone="slate">Inactive</Badge>
                    </span>
                  )}
                </span>
                <Link
                  href={`/inventory/products?categoryId=${c.id}`}
                  className="text-xs text-slate-500 hover:text-mod-inventory"
                >
                  {c.productCount} product{c.productCount === 1 ? '' : 's'}
                </Link>
                {canWrite && (
                  <button
                    aria-label={`Edit ${c.name}`}
                    className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    onClick={() => {
                      setFormError(null);
                      setEdit({
                        id: c.id,
                        name: c.name,
                        parentId: c.parentId ?? '',
                        isActive: c.isActive,
                      });
                    }}
                  >
                    <Pencil className="size-4" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Modal
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit?.id ? 'Edit category' : 'New category'}
        footer={
          <>
            <Button onClick={() => setEdit(null)} disabled={saving}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save} loading={saving}>
              Save
            </Button>
          </>
        }
      >
        {edit && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            {formError && <ErrorBox message={formError} />}
            <Field label="Name" htmlFor="cat-name" required>
              <input
                id="cat-name"
                autoFocus
                className={inputClass}
                value={edit.name}
                maxLength={100}
                onChange={(e) => setEdit({ ...edit, name: e.target.value })}
              />
            </Field>
            <Field label="Inside" htmlFor="cat-parent" hint="Leave empty for a top-level category">
              <select
                id="cat-parent"
                className={inputClass}
                value={edit.parentId}
                onChange={(e) => setEdit({ ...edit, parentId: e.target.value })}
              >
                <option value="">— Top level —</option>
                {parentOptions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.path}
                  </option>
                ))}
              </select>
            </Field>
            {edit.id && (
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={edit.isActive}
                  onChange={(e) => setEdit({ ...edit, isActive: e.target.checked })}
                />
                Active (inactive categories cannot be chosen for products)
              </label>
            )}
            <button type="submit" className="hidden" />
          </form>
        )}
      </Modal>
    </Card>
  );
}

// ── Units ────────────────────────────────────────────────────────────────────

function Units() {
  const { can } = useAuth();
  const toast = useToast();
  const canWrite = can('inventory.product.write');
  const [rows, setRows] = useState<UnitDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setError(null);
    api<UnitDto[]>('/inventory/units')
      .then(setRows)
      .catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (!/^[A-Z0-9_]{1,10}$/.test(c))
      return setFormError('Code: 1–10 letters, digits or _ (e.g. CTN)');
    if (!name.trim()) return setFormError('Name is required');
    setSaving(true);
    setFormError(null);
    try {
      await api('/inventory/units', {
        method: 'POST',
        body: JSON.stringify({ code: c, name: name.trim() }),
      });
      toast(`Unit ${c} created`);
      setCode('');
      setName('');
      load();
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card
      title={
        <span id="units" className="flex items-center gap-2">
          <Ruler className="size-4 text-slate-400" /> Units of measure
        </span>
      }
    >
      {error ? (
        <ErrorBox message={error} onRetry={load} />
      ) : !rows ? (
        <PageLoader />
      ) : (
        <ul className="divide-y divide-slate-100">
          {rows.map((u) => (
            <li key={u.id} className="flex items-center gap-3 py-2 text-sm">
              <span className="w-16 font-mono font-medium text-slate-800">{u.code}</span>
              <span className="text-slate-600">{u.name}</span>
            </li>
          ))}
        </ul>
      )}
      {canWrite && (
        <form onSubmit={add} className="mt-4 space-y-2 border-t border-slate-200 pt-4">
          <p className="text-sm font-medium text-slate-700">Add a unit</p>
          <div className="flex gap-2">
            <input
              aria-label="Unit code"
              placeholder="CTN"
              className={clsx(inputClass, 'w-24 font-mono uppercase')}
              value={code}
              maxLength={10}
              onChange={(e) => setCode(e.target.value)}
            />
            <input
              aria-label="Unit name"
              placeholder="Carton"
              className={inputClass}
              value={name}
              maxLength={50}
              onChange={(e) => setName(e.target.value)}
            />
            <Button type="submit" variant="primary" loading={saving}>
              <Plus className="size-4" />
            </Button>
          </div>
          {formError && <p className="text-xs text-red-600">{formError}</p>}
        </form>
      )}
    </Card>
  );
}

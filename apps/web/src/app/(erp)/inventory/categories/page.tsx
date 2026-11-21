'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { CornerDownRight, FolderPlus, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import type { CategoryDto, SaveCategoryRequest } from '@erp/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { errorMessage } from '@/lib/errors';
import { useApiQuery } from '@/lib/use-api';
import { Button, IconButton } from '@/components/ui/button';
import { Checkbox, SelectField, TextField } from '@/components/ui/form';
import { ConfirmDialog, Modal } from '@/components/ui/modal';
import { Badge, PageHeader, RequirePermission } from '@/components/ui/page';
import { useToast } from '@/components/ui/toast';

interface TreeRow extends CategoryDto {
  depth: number;
  childCount: number;
}

/** Depth-first order: each category followed by its sub-categories. */
function toTree(list: CategoryDto[]): TreeRow[] {
  const children = new Map<string | null, CategoryDto[]>();
  for (const c of list) children.set(c.parentId, [...(children.get(c.parentId) ?? []), c]);
  const out: TreeRow[] = [];
  const walk = (parentId: string | null, depth: number) => {
    const kids = (children.get(parentId) ?? []).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    for (const c of kids) {
      out.push({ ...c, depth, childCount: children.get(c.id)?.length ?? 0 });
      walk(c.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

export default function CategoriesPage() {
  return (
    <RequirePermission permission="inventory.product.read">
      <CategoriesScreen />
    </RequirePermission>
  );
}

type Editing = { mode: 'new'; parentId: string | null } | { mode: 'edit'; category: TreeRow };

function CategoriesScreen() {
  const { t } = useI18n();
  const { can } = useAuth();
  const toast = useToast();
  const canWrite = can('inventory.product.write');
  const categories = useApiQuery<CategoryDto[]>('/categories');
  const rows = useMemo(() => toTree(categories.data ?? []), [categories.data]);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [deleting, setDeleting] = useState<TreeRow | null>(null);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        href="/inventory/categories"
        actions={
          canWrite && (
            <Button icon={Plus} onClick={() => setEditing({ mode: 'new', parentId: null })}>
              {t('categories.new')}
            </Button>
          )
        }
      />

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {categories.loading && !categories.data ? (
          <div className="flex justify-center py-16 text-slate-400">
            <Loader2 className="size-6 animate-spin" />
          </div>
        ) : categories.error ? (
          <p className="py-12 text-center text-sm text-red-600">
            {errorMessage(categories.error, t)}
          </p>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-14 text-center">
            <FolderPlus className="size-8 text-slate-300" />
            <p className="mt-2 text-sm text-slate-500">{t('categories.empty')}</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((c) => (
              <li
                key={c.id}
                className={clsx(
                  'flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50/70',
                  !c.isActive && 'opacity-60',
                )}
              >
                <div
                  className="flex min-w-0 flex-1 items-center gap-2"
                  style={{ paddingLeft: c.depth * 24 }}
                >
                  {c.depth > 0 && <CornerDownRight className="size-4 shrink-0 text-slate-300" />}
                  <span
                    className={clsx(
                      'truncate',
                      c.depth === 0 ? 'font-semibold text-slate-900' : 'text-slate-800',
                    )}
                  >
                    {c.name}
                  </span>
                  {!c.isActive && <Badge>{t('status.inactive')}</Badge>}
                </div>
                <Link
                  href={`/inventory/products?category=${c.id}`}
                  className="shrink-0 text-xs whitespace-nowrap text-slate-500 hover:text-blue-600 hover:underline"
                >
                  {t('categories.productCount', { count: c.productCount })}
                </Link>
                {canWrite && (
                  <div className="flex shrink-0 gap-0.5">
                    <IconButton
                      icon={Plus}
                      label={t('categories.addChild')}
                      onClick={() => setEditing({ mode: 'new', parentId: c.id })}
                    />
                    <IconButton
                      icon={Pencil}
                      label={t('common.edit')}
                      onClick={() => setEditing({ mode: 'edit', category: c })}
                    />
                    <IconButton
                      icon={Trash2}
                      tone="danger"
                      label={
                        c.productCount > 0 || c.childCount > 0
                          ? t('categories.cannotDelete')
                          : t('common.delete')
                      }
                      disabled={c.productCount > 0 || c.childCount > 0}
                      onClick={() => setDeleting(c)}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="text-xs text-slate-500">{t('categories.help')}</p>

      {editing && (
        <CategoryModal
          editing={editing}
          all={categories.data ?? []}
          onClose={() => setEditing(null)}
          onSaved={(c) => {
            setEditing(null);
            toast.success(
              t(editing.mode === 'new' ? 'categories.created' : 'categories.updated', {
                name: c.path,
              }),
            );
            void categories.reload();
          }}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        title={t('categories.delete')}
        message={t('categories.confirmDelete', { name: deleting?.path ?? '' })}
        confirmLabel={t('common.delete')}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await api(`/categories/${deleting.id}`, { method: 'DELETE' });
            toast.success(t('categories.deleted', { name: deleting.path }));
            setDeleting(null);
            void categories.reload();
          } catch (err) {
            toast.error(errorMessage(err, t));
          }
        }}
      />
    </div>
  );
}

function CategoryModal({
  editing,
  all,
  onClose,
  onSaved,
}: {
  editing: Editing;
  all: CategoryDto[];
  onClose: () => void;
  onSaved: (c: CategoryDto) => void;
}) {
  const { t } = useI18n();
  const current = editing.mode === 'edit' ? editing.category : null;
  const [name, setName] = useState(current?.name ?? '');
  const [parentId, setParentId] = useState(
    current ? (current.parentId ?? '') : editing.mode === 'new' ? (editing.parentId ?? '') : '',
  );
  const [isActive, setIsActive] = useState(current?.isActive ?? true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // A category cannot move under itself or one of its sub-categories.
  const forbidden = useMemo(() => {
    if (!current) return new Set<string>();
    const ids = new Set([current.id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const c of all) {
        if (c.parentId && ids.has(c.parentId) && !ids.has(c.id)) {
          ids.add(c.id);
          grew = true;
        }
      }
    }
    return ids;
  }, [all, current]);

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!name.trim()) return setError(t('validation.required'));
    setSaving(true);
    setError(null);
    const body: SaveCategoryRequest = { name: name.trim(), parentId: parentId || null, isActive };
    try {
      const saved = await api<CategoryDto>(current ? `/categories/${current.id}` : '/categories', {
        method: current ? 'PATCH' : 'POST',
        body: JSON.stringify(body),
      });
      onSaved(saved);
    } catch (err) {
      setError(errorMessage(err, t));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      size="sm"
      onClose={onClose}
      title={current ? t('categories.edit') : t('categories.new')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="category-form" loading={saving}>
            {current ? t('common.save') : t('common.create')}
          </Button>
        </>
      }
    >
      <form id="category-form" onSubmit={submit} className="space-y-4" noValidate>
        <TextField
          label={t('categories.form.name')}
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <SelectField
          label={t('categories.form.parent')}
          value={parentId}
          onChange={(e) => setParentId(e.target.value)}
          placeholder={t('categories.form.noParent')}
          options={all
            .filter((c) => !forbidden.has(c.id))
            .map((c) => ({ value: c.id, label: c.path }))}
        />
        {current && (
          <Checkbox
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            label={t('status.active')}
            description={t('categories.form.activeHelp')}
          />
        )}
        {error && (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}

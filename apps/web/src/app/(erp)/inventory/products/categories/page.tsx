'use client';

import { useCallback, useMemo, useState } from 'react';
import clsx from 'clsx';
import {
  ChevronRight,
  Eye,
  EyeOff,
  Folder,
  FolderOpen,
  FolderPlus,
  FolderTree,
  Loader2,
  Pencil,
  Plus,
  Power,
  Search,
} from 'lucide-react';
import type { CategoryNode } from '@erp/shared';
import { api, ApiRequestError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApiData } from '@/lib/use-api-data';
import { categoryOptionLabel, flattenCategories, type FlatCategoryRow } from '@/lib/inventory';
import { CatalogHeader } from '@/components/inventory/catalog-header';
import {
  AccessDenied,
  Dialog,
  EmptyState,
  ErrorBanner,
  Field,
  inputClass,
  PrimaryButton,
  SecondaryButton,
  SkeletonRows,
  SuccessState,
} from '@/components/ui';

type EditorState =
  { mode: 'create'; parentId: string | null } | { mode: 'edit'; category: CategoryNode } | null;

type FlatRow = FlatCategoryRow;
const flatten = flattenCategories;

function descendantIds(node: CategoryNode, out = new Set<string>()): Set<string> {
  out.add(node.id);
  node.children.forEach((c) => descendantIds(c, out));
  return out;
}

/**
 * Keeps nodes that match the search (and their ancestors, so the path stays visible)
 * and hides inactive branches unless `showInactive`.
 */
function filterTree(nodes: CategoryNode[], q: string, showInactive: boolean): CategoryNode[] {
  const result: CategoryNode[] = [];
  for (const node of nodes) {
    if (!showInactive && !node.isActive) continue;
    const children = filterTree(node.children, q, showInactive);
    if (!q || node.name.toLowerCase().includes(q) || children.length) {
      result.push({ ...node, children });
    }
  }
  return result;
}

export default function CategoriesPage() {
  const { can } = useAuth();
  const canRead = can('inventory.product.read');
  const canWrite = can('inventory.product.write');
  const { data, error, loading, reload } = useApiData<CategoryNode[]>(
    canRead ? '/inventory/categories' : null,
  );

  const [query, setQuery] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [editor, setEditor] = useState<EditorState>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const all = useMemo(() => flatten(data ?? []), [data]);
  const inactiveCount = all.filter((r) => !r.node.isActive).length;
  const q = query.trim().toLowerCase();
  const tree = useMemo(() => filterTree(data ?? [], q, showInactive), [data, q, showInactive]);

  const toggle = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  async function setActive(node: CategoryNode, isActive: boolean) {
    setBusyId(node.id);
    setActionError(null);
    try {
      await api(`/inventory/categories/${node.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive }),
      });
      await reload();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not update the category');
    } finally {
      setBusyId(null);
    }
  }

  if (!canRead) return <AccessDenied permission="inventory.product.read" what="categories" />;

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <CatalogHeader
        title="Categories"
        description="Group products into a tree, e.g. Food › Drinks › Juices."
        icon={FolderTree}
        actions={
          canWrite && (
            <PrimaryButton onDark onClick={() => setEditor({ mode: 'create', parentId: null })}>
              <Plus className="size-4" /> New category
            </PrimaryButton>
          )
        }
      />

      {error && <ErrorBanner message={error} onRetry={reload} />}
      {actionError && <ErrorBanner message={actionError} />}

      <section
        className="animate-fade-up overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs"
        style={{ animationDelay: '80ms' }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-3">
          <div className="relative w-full max-w-xs">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search categories…"
              className={inputClass() + ' pl-9'}
            />
          </div>
          {inactiveCount > 0 && (
            <button
              onClick={() => setShowInactive((v) => !v)}
              className={clsx(
                'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors',
                showInactive
                  ? 'bg-slate-800 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
              )}
            >
              {showInactive ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
              {showInactive ? 'Showing' : 'Show'} {inactiveCount} inactive
            </button>
          )}
        </div>

        {loading && !data ? (
          <SkeletonRows rows={5} />
        ) : tree.length === 0 ? (
          <EmptyState
            icon={FolderTree}
            title={q ? 'No category matches your search' : 'No categories yet'}
            text={
              q
                ? 'Try another name.'
                : 'Create top-level groups first (e.g. Food, Cleaning), then add sub-categories.'
            }
            action={
              !q &&
              canWrite && (
                <PrimaryButton onClick={() => setEditor({ mode: 'create', parentId: null })}>
                  <Plus className="size-4" /> New category
                </PrimaryButton>
              )
            }
          />
        ) : (
          <ul className="py-1.5">
            {tree.map((node, i) => (
              <TreeRow
                key={node.id}
                node={node}
                depth={0}
                index={i}
                // While searching, keep every matching branch open.
                collapsed={q ? new Set() : collapsed}
                onToggle={toggle}
                canWrite={canWrite}
                busyId={busyId}
                onAddChild={(n) => setEditor({ mode: 'create', parentId: n.id })}
                onEdit={(n) => setEditor({ mode: 'edit', category: n })}
                onSetActive={setActive}
              />
            ))}
          </ul>
        )}
      </section>

      <CategoryDialog
        state={editor}
        all={all}
        onClose={() => setEditor(null)}
        onSaved={() => void reload()}
      />
    </div>
  );
}

function TreeRow({
  node,
  depth,
  index,
  collapsed,
  onToggle,
  canWrite,
  busyId,
  onAddChild,
  onEdit,
  onSetActive,
}: {
  node: CategoryNode;
  depth: number;
  index: number;
  collapsed: Set<string>;
  onToggle: (id: string) => void;
  canWrite: boolean;
  busyId: string | null;
  onAddChild: (n: CategoryNode) => void;
  onEdit: (n: CategoryNode) => void;
  onSetActive: (n: CategoryNode, active: boolean) => void;
}) {
  const hasChildren = node.children.length > 0;
  const open = !collapsed.has(node.id);
  const FolderIcon = hasChildren && open ? FolderOpen : Folder;
  const busy = busyId === node.id;

  return (
    <li>
      <div
        className="group animate-fade-up flex items-center gap-2 py-1.5 pr-3 transition-colors hover:bg-emerald-50/50"
        style={{
          paddingLeft: `${12 + depth * 24}px`,
          animationDelay: `${Math.min(index, 10) * 35}ms`,
        }}
      >
        <button
          onClick={() => hasChildren && onToggle(node.id)}
          aria-label={open ? 'Collapse' : 'Expand'}
          className={clsx(
            'grid size-6 place-items-center rounded text-slate-400 transition-colors',
            hasChildren ? 'hover:bg-slate-100 hover:text-slate-600' : 'invisible',
          )}
        >
          <ChevronRight
            className={clsx('size-4 transition-transform duration-200', open && 'rotate-90')}
          />
        </button>
        <FolderIcon
          className={clsx(
            'size-4.5 shrink-0',
            node.isActive ? 'text-mod-inventory' : 'text-slate-300',
          )}
        />
        <span
          className={clsx(
            'min-w-0 flex-1 truncate text-sm',
            node.isActive ? 'font-medium text-slate-800' : 'text-slate-400 line-through',
          )}
        >
          {node.name}
        </span>

        {!node.isActive && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
            Inactive
          </span>
        )}
        <span
          className="rounded-full bg-slate-50 px-2 py-0.5 text-[11px] text-slate-500 tabular-nums ring-1 ring-slate-200/70"
          title="Products directly in this category"
        >
          {node.productCount} {node.productCount === 1 ? 'product' : 'products'}
        </span>

        {canWrite && (
          <div className="flex items-center gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
            {node.isActive && (
              <IconButton label="Add sub-category" onClick={() => onAddChild(node)}>
                <FolderPlus className="size-4" />
              </IconButton>
            )}
            <IconButton label="Rename or move" onClick={() => onEdit(node)}>
              <Pencil className="size-4" />
            </IconButton>
            <IconButton
              label={node.isActive ? 'Deactivate' : 'Reactivate'}
              onClick={() => onSetActive(node, !node.isActive)}
              disabled={busy}
              tone={node.isActive ? 'danger' : 'success'}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Power className="size-4" />}
            </IconButton>
          </div>
        )}
      </div>

      {hasChildren && open && (
        <ul className="relative">
          <span
            className="absolute top-0 bottom-2 w-px bg-emerald-200/70"
            style={{ left: `${24 + depth * 24}px` }}
          />
          {node.children.map((child, i) => (
            <TreeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              index={i}
              collapsed={collapsed}
              onToggle={onToggle}
              canWrite={canWrite}
              busyId={busyId}
              onAddChild={onAddChild}
              onEdit={onEdit}
              onSetActive={onSetActive}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function IconButton({
  label,
  tone = 'neutral',
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  tone?: 'neutral' | 'danger' | 'success';
}) {
  return (
    <button
      {...props}
      title={label}
      aria-label={label}
      className={clsx(
        'grid size-7 place-items-center rounded-md text-slate-400 transition-all active:scale-90 disabled:opacity-50',
        tone === 'neutral' && 'hover:bg-slate-100 hover:text-slate-700',
        tone === 'danger' && 'hover:bg-red-50 hover:text-red-600',
        tone === 'success' && 'hover:bg-emerald-50 hover:text-mod-inventory',
      )}
    >
      {children}
    </button>
  );
}

function CategoryDialog({
  state,
  all,
  onClose,
  onSaved,
}: {
  state: EditorState;
  all: FlatRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  // Remount the form for each opening so it starts from the right values.
  const key =
    state === null ? 'closed' : state.mode === 'edit' ? state.category.id : `new-${state.parentId}`;
  const title = state?.mode === 'edit' ? 'Edit category' : 'New category';
  return (
    <Dialog
      open={state !== null}
      onClose={onClose}
      title={title}
      description={
        state?.mode === 'edit'
          ? 'Rename it or move it under another category.'
          : 'Products are grouped by category in lists and reports.'
      }
    >
      {state && (
        <CategoryForm key={key} state={state} all={all} onClose={onClose} onSaved={onSaved} />
      )}
    </Dialog>
  );
}

function CategoryForm({
  state,
  all,
  onClose,
  onSaved,
}: {
  state: NonNullable<EditorState>;
  all: FlatRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = state.mode === 'edit' ? state.category : null;
  const [name, setName] = useState(editing?.name ?? '');
  const [parentId, setParentId] = useState<string>(
    (editing ? editing.parentId : state.mode === 'create' ? state.parentId : null) ?? '',
  );
  const [errors, setErrors] = useState<{ name?: string; form?: string }>({});
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  // A category cannot move under itself or its descendants; inactive parents are not offered.
  const parentOptions = useMemo(() => {
    const excluded = editing ? descendantIds(editing) : new Set<string>();
    return all.filter(
      (r) => !excluded.has(r.node.id) && (r.node.isActive || r.node.id === editing?.parentId),
    );
  }, [all, editing]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setErrors({ name: 'Give the category a name.' });
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      const body = { name: name.trim(), parentId: parentId || null };
      if (editing) {
        await api(`/inventory/categories/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
      } else {
        await api('/inventory/categories', {
          method: 'POST',
          body: JSON.stringify(body.parentId ? body : { name: body.name }),
        });
      }
      setDone(true);
      onSaved();
      setTimeout(onClose, 1100);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not save';
      setErrors(
        err instanceof ApiRequestError && err.status === 409 ? { name: msg } : { form: msg },
      );
    } finally {
      setSaving(false);
    }
  }

  if (done) {
    return <SuccessState message={editing ? 'Category updated' : `“${name.trim()}” created`} />;
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {errors.form && <ErrorBanner message={errors.form} />}
      <Field label="Name" error={errors.name}>
        {(id, invalid) => (
          <input
            id={id}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            placeholder="e.g. Soft drinks"
            className={inputClass(invalid)}
          />
        )}
      </Field>
      <Field label="Parent category" hint="Leave empty for a top-level category.">
        {(id) => (
          <select
            id={id}
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
            className={inputClass()}
          >
            <option value="">— None (top level) —</option>
            {parentOptions.map((row) => (
              <option key={row.node.id} value={row.node.id}>
                {categoryOptionLabel(row)}
              </option>
            ))}
          </select>
        )}
      </Field>
      <div className="flex justify-end gap-2 pt-2">
        <SecondaryButton type="button" onClick={onClose}>
          Cancel
        </SecondaryButton>
        <PrimaryButton type="submit" loading={saving}>
          {editing ? 'Save changes' : 'Create category'}
        </PrimaryButton>
      </div>
    </form>
  );
}

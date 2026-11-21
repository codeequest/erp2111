'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'motion/react';
import clsx from 'clsx';
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  Check,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Eye,
  EyeOff,
  Folder,
  FolderInput,
  FolderOpen,
  FolderPlus,
  FolderTree,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  X,
} from 'lucide-react';
import type { CategoryNode } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { categoriesApi, flattenTree, subtreeIds, type TreeRow } from '@/lib/inventory';
import { AccessDenied } from '@/components/access-denied';
import { HeaderButton, ProductsHeader } from '@/components/inventory/products-header';
import { CountUp } from '@/components/ui/count-up';
import { inputClass } from '@/components/ui/field';
import { Button, Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';

type Editing = { mode: 'rename'; id: string } | { mode: 'add'; parentId: string | null } | null;

export default function CategoriesPage() {
  const { can } = useAuth();
  const toast = useToast();
  const canRead = can('inventory.product.read');
  const canWrite = can('inventory.product.write');

  const [nodes, setNodes] = useState<CategoryNode[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Editing>(null);
  const [moving, setMoving] = useState<TreeRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  // On touch screens the row actions show for the tapped row only.
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = () =>
    categoriesApi.list().then(
      (n) => {
        setNodes(n);
        setError(null);
      },
      (e: Error) => setError(e.message),
    );

  useEffect(() => {
    if (canRead) void load();
  }, [canRead]);

  const rows = useMemo(() => flattenTree(nodes ?? []), [nodes]);

  /** Products in each category including all sub-categories. */
  const totals = useMemo(() => {
    // rows are depth-first, so walking backwards visits children before parents
    const m = new Map<string, number>();
    for (let i = rows.length - 1; i >= 0; i--) {
      const r = rows[i];
      const total = (m.get(r.id) ?? 0) + r.productCount;
      m.set(r.id, total);
      if (r.parentId) m.set(r.parentId, (m.get(r.parentId) ?? 0) + total);
    }
    return m;
  }, [rows]);

  const visible = useMemo(() => {
    const out: TreeRow[] = [];
    const hiddenUnder = new Set<string>();
    for (const r of rows) {
      if (r.parentId && hiddenUnder.has(r.parentId)) {
        hiddenUnder.add(r.id);
        continue;
      }
      if (!showArchived && !r.isActive) {
        hiddenUnder.add(r.id);
        continue;
      }
      out.push(r);
      if (collapsed.has(r.id)) hiddenUnder.add(r.id);
    }
    return out;
  }, [rows, showArchived, collapsed]);

  const stats = useMemo(
    () => ({
      total: rows.filter((r) => r.isActive).length,
      top: rows.filter((r) => r.isActive && !r.parentId).length,
      archived: rows.filter((r) => !r.isActive).length,
    }),
    [rows],
  );

  async function run(id: string | null, fn: () => Promise<unknown>, success: string) {
    setBusyId(id ?? 'new');
    try {
      await fn();
      await load();
      toast({ kind: 'success', title: success });
      return true;
    } catch (e) {
      toast({
        kind: 'error',
        title: 'Not saved',
        description: e instanceof Error ? e.message : String(e),
      });
      return false;
    } finally {
      setBusyId(null);
    }
  }

  const toggle = (id: string) =>
    setCollapsed((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  if (!canRead) return <AccessDenied permission="inventory.product.read" what="view categories" />;

  const parentsWithChildren = rows.filter((r) => r.childCount > 0).map((r) => r.id);
  const allCollapsed =
    parentsWithChildren.length > 0 && parentsWithChildren.every((id) => collapsed.has(id));

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-10">
      <ProductsHeader
        title="Categories"
        subtitle="Group products into a tree, e.g. Beverages › Soft drinks."
        actions={
          canWrite && (
            <HeaderButton onClick={() => setEditing({ mode: 'add', parentId: null })}>
              <FolderPlus className="size-4" /> New category
            </HeaderButton>
          )
        }
      />

      <motion.section
        className="grid grid-cols-3 gap-3 sm:gap-4"
        initial="hidden"
        animate="show"
        variants={{ show: { transition: { staggerChildren: 0.08 } } }}
      >
        {[
          {
            label: 'Active categories',
            value: stats.total,
            tone: 'from-emerald-500 to-teal-600',
            icon: FolderTree,
          },
          { label: 'Top level', value: stats.top, tone: 'from-sky-400 to-blue-600', icon: Folder },
          {
            label: 'Archived',
            value: stats.archived,
            tone: 'from-rose-400 to-pink-600',
            icon: Archive,
          },
        ].map((s) => (
          <motion.div
            key={s.label}
            variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }}
            whileHover={{ y: -3 }}
            className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/80 sm:flex-row sm:items-center sm:p-5"
          >
            <div
              className={clsx(
                'grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br text-white shadow-sm',
                s.tone,
              )}
            >
              <s.icon className="size-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 sm:text-sm">{s.label}</p>
              <p className="text-xl font-semibold text-slate-900 tabular-nums sm:text-2xl">
                {nodes ? <CountUp value={s.value} /> : '–'}
              </p>
            </div>
          </motion.div>
        ))}
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.15 }}
        className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/80"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 p-3 sm:p-4">
          <p className="text-sm text-slate-500">
            {canWrite ? (
              <>
                <span className="sm:hidden">Tap a category to rename, move or archive it.</span>
                <span className="hidden sm:inline">
                  Hover a category to rename, move or archive it.
                </span>
              </>
            ) : (
              'Read-only view.'
            )}
          </p>
          <div className="flex gap-2">
            {parentsWithChildren.length > 0 && (
              <Button
                variant="ghost"
                className="!px-3"
                onClick={() =>
                  setCollapsed(allCollapsed ? new Set() : new Set(parentsWithChildren))
                }
              >
                {allCollapsed ? (
                  <ChevronsUpDown className="size-4" />
                ) : (
                  <ChevronsDownUp className="size-4" />
                )}
                {allCollapsed ? 'Expand all' : 'Collapse all'}
              </Button>
            )}
            <Button
              variant={showArchived ? 'secondary' : 'ghost'}
              className="!px-3"
              onClick={() => setShowArchived((v) => !v)}
              aria-pressed={showArchived}
            >
              {showArchived ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              {showArchived ? 'Hide archived' : 'Show archived'}
            </Button>
          </div>
        </div>

        {error ? (
          <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <AlertTriangle className="size-8 text-rose-400" />
            <p className="text-sm text-slate-600">{error}</p>
            <Button variant="secondary" onClick={() => void load()}>
              <RotateCcw className="size-4" /> Try again
            </Button>
          </div>
        ) : !nodes ? (
          <div className="grid h-48 place-items-center text-slate-400">
            <Loader2 className="size-6 animate-spin" />
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            <AnimatePresence initial={false}>
              {editing?.mode === 'add' && editing.parentId === null && (
                <NameEditor
                  key="add-root"
                  depth={0}
                  placeholder="New top-level category"
                  busy={busyId === 'new'}
                  onCancel={() => setEditing(null)}
                  onSave={async (name) => {
                    if (
                      await run(
                        null,
                        () => categoriesApi.create({ name }),
                        `Category “${name}” created`,
                      )
                    )
                      setEditing(null);
                  }}
                />
              )}
            </AnimatePresence>

            {visible.length === 0 && editing?.mode !== 'add' && (
              <li className="flex flex-col items-center px-6 py-16 text-center">
                <motion.div
                  animate={{ y: [0, -4, 0] }}
                  transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                  className="grid size-16 place-items-center rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-600 text-white shadow-lg"
                >
                  <FolderTree className="size-7" />
                </motion.div>
                <h2 className="mt-5 font-semibold text-slate-900">No categories yet</h2>
                <p className="mt-1 max-w-sm text-sm text-slate-500">
                  Categories make the catalogue easy to browse and filter. Start with a few broad
                  ones — you can nest them later.
                </p>
                {canWrite && (
                  <Button
                    className="mt-5"
                    onClick={() => setEditing({ mode: 'add', parentId: null })}
                  >
                    <Plus className="size-4" /> Create the first category
                  </Button>
                )}
              </li>
            )}

            <AnimatePresence initial={false}>
              {visible.map((r) => (
                <CategoryRowItem
                  key={r.id}
                  row={r}
                  total={totals.get(r.id) ?? 0}
                  collapsed={collapsed.has(r.id)}
                  selected={selectedId === r.id}
                  onSelect={() => setSelectedId((s) => (s === r.id ? null : r.id))}
                  canWrite={canWrite}
                  busy={busyId === r.id}
                  editing={editing}
                  addBusy={busyId === 'new'}
                  onToggle={() => toggle(r.id)}
                  onEdit={setEditing}
                  onMove={() => setMoving(r)}
                  onRename={async (name) => {
                    if (
                      await run(
                        r.id,
                        () => categoriesApi.update(r.id, { name }),
                        'Category renamed',
                      )
                    )
                      setEditing(null);
                  }}
                  onAddChild={async (name) => {
                    if (
                      await run(
                        null,
                        () => categoriesApi.create({ name, parentId: r.id }),
                        `“${name}” added under ${r.name}`,
                      )
                    ) {
                      setEditing(null);
                      setCollapsed((s) => {
                        const n = new Set(s);
                        n.delete(r.id);
                        return n;
                      });
                    }
                  }}
                  onArchive={(archive) =>
                    void run(
                      r.id,
                      () => categoriesApi.update(r.id, { isActive: !archive }),
                      archive ? `“${r.name}” archived` : `“${r.name}” restored`,
                    )
                  }
                />
              ))}
            </AnimatePresence>
          </ul>
        )}
      </motion.section>

      <MoveDialog
        row={moving}
        rows={rows}
        busy={busyId === moving?.id}
        onClose={() => setMoving(null)}
        onMove={async (parentId) => {
          if (!moving) return;
          if (
            await run(
              moving.id,
              () => categoriesApi.update(moving.id, { parentId }),
              `“${moving.name}” moved`,
            )
          )
            setMoving(null);
        }}
      />
    </div>
  );
}

function CategoryRowItem({
  row,
  total,
  collapsed,
  selected,
  onSelect,
  canWrite,
  busy,
  editing,
  addBusy,
  onToggle,
  onEdit,
  onMove,
  onRename,
  onAddChild,
  onArchive,
}: {
  row: TreeRow;
  total: number;
  collapsed: boolean;
  selected: boolean;
  onSelect: () => void;
  canWrite: boolean;
  busy: boolean;
  editing: Editing;
  addBusy: boolean;
  onToggle: () => void;
  onEdit: (e: Editing) => void;
  onMove: () => void;
  onRename: (name: string) => Promise<void>;
  onAddChild: (name: string) => Promise<void>;
  onArchive: (archive: boolean) => void;
}) {
  const renaming = editing?.mode === 'rename' && editing.id === row.id;
  const adding = editing?.mode === 'add' && editing.parentId === row.id;
  const FolderIcon = row.childCount > 0 && !collapsed ? FolderOpen : Folder;
  const actionBtn =
    'grid size-8 place-items-center rounded-lg text-slate-400 transition hover:bg-white hover:text-slate-700 hover:shadow-sm hover:ring-1 hover:ring-slate-200 disabled:opacity-40';

  return (
    <>
      {renaming ? (
        <NameEditor
          depth={row.depth}
          initial={row.name}
          placeholder="Category name"
          busy={busy}
          onCancel={() => onEdit(null)}
          onSave={onRename}
        />
      ) : (
        <motion.li
          layout="position"
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.2 }}
          className={clsx(
            'group flex items-center gap-2 py-2.5 pr-3 hover:bg-emerald-50/40',
            !row.isActive && 'bg-slate-50/60',
          )}
          style={{ paddingLeft: `${12 + row.depth * 24}px` }}
          onClick={onSelect}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            disabled={row.childCount === 0}
            className="grid size-6 place-items-center rounded text-slate-400 hover:bg-slate-100 disabled:invisible"
            aria-label={collapsed ? 'Expand' : 'Collapse'}
            aria-expanded={!collapsed}
          >
            <motion.span animate={{ rotate: collapsed ? 0 : 90 }} transition={{ duration: 0.15 }}>
              <ChevronRight className="size-4" />
            </motion.span>
          </button>
          <FolderIcon
            className={clsx(
              'size-5 shrink-0',
              row.isActive ? 'text-emerald-500' : 'text-slate-300',
            )}
          />
          <span
            className={clsx(
              'truncate font-medium',
              row.isActive ? 'text-slate-800' : 'text-slate-400 line-through',
            )}
          >
            {row.name}
          </span>
          {!row.isActive && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 ring-1 ring-slate-200">
              Archived
            </span>
          )}
          <Link
            href={`/inventory/products?cat=${row.id}${row.isActive ? '' : '&status=all'}`}
            className="ml-auto shrink-0 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 tabular-nums transition hover:bg-emerald-100 hover:text-emerald-800"
            title={
              total === row.productCount
                ? `${total} product${total === 1 ? '' : 's'}`
                : `${row.productCount} directly, ${total} including sub-categories`
            }
          >
            {total} product{total === 1 ? '' : 's'}
          </Link>
          {canWrite && (
            <div
              onClick={(e) => e.stopPropagation()}
              className={clsx(
                'shrink-0 gap-0.5 sm:flex sm:opacity-0 sm:transition-opacity sm:group-focus-within:opacity-100 sm:group-hover:opacity-100',
                selected ? 'flex' : 'hidden',
              )}
            >
              {busy ? (
                <Loader2 className="m-2 size-4 animate-spin text-slate-400" />
              ) : row.isActive ? (
                <>
                  <button
                    className={actionBtn}
                    title="Add sub-category"
                    onClick={() => onEdit({ mode: 'add', parentId: row.id })}
                  >
                    <FolderPlus className="size-4" />
                  </button>
                  <button
                    className={actionBtn}
                    title="Rename"
                    onClick={() => onEdit({ mode: 'rename', id: row.id })}
                  >
                    <Pencil className="size-4" />
                  </button>
                  <button className={actionBtn} title="Move" onClick={onMove}>
                    <FolderInput className="size-4" />
                  </button>
                  <button
                    className={clsx(actionBtn, 'hover:!text-rose-600')}
                    title="Archive"
                    onClick={() => onArchive(true)}
                  >
                    <Archive className="size-4" />
                  </button>
                </>
              ) : (
                <button
                  className={clsx(actionBtn, 'hover:!text-emerald-600')}
                  title="Restore"
                  onClick={() => onArchive(false)}
                >
                  <ArchiveRestore className="size-4" />
                </button>
              )}
            </div>
          )}
        </motion.li>
      )}
      <AnimatePresence initial={false}>
        {adding && (
          <NameEditor
            key={`add-${row.id}`}
            depth={row.depth + 1}
            placeholder={`New category under ${row.name}`}
            busy={addBusy}
            onCancel={() => onEdit(null)}
            onSave={onAddChild}
          />
        )}
      </AnimatePresence>
    </>
  );
}

function NameEditor({
  depth,
  initial = '',
  placeholder,
  busy,
  onCancel,
  onSave,
}: {
  depth: number;
  initial?: string;
  placeholder: string;
  busy: boolean;
  onCancel: () => void;
  onSave: (name: string) => Promise<void> | void;
}) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const save = () => {
    const name = value.trim();
    if (!name) {
      setError(true);
      ref.current?.focus();
      return;
    }
    if (name === initial) return onCancel();
    void onSave(name);
  };

  return (
    <motion.li
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="overflow-hidden bg-emerald-50/50"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        className="flex items-center gap-2 py-2 pr-3"
        style={{ paddingLeft: `${12 + depth * 24 + 32}px` }}
      >
        <motion.div
          className="flex-1"
          key={error ? 'err' : 'ok'}
          animate={error ? { x: [0, -6, 6, -3, 3, 0] } : undefined}
          transition={{ duration: 0.3 }}
        >
          <input
            ref={ref}
            value={value}
            maxLength={100}
            onChange={(e) => {
              setValue(e.target.value);
              setError(false);
            }}
            onKeyDown={(e) => e.key === 'Escape' && onCancel()}
            placeholder={placeholder}
            aria-label={placeholder}
            aria-invalid={error}
            className={clsx(inputClass(error), 'py-1.5')}
          />
        </motion.div>
        <button
          type="submit"
          disabled={busy}
          className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm transition hover:brightness-105 disabled:opacity-60"
          aria-label="Save"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="grid size-8 place-items-center rounded-lg text-slate-500 hover:bg-white hover:shadow-sm"
          aria-label="Cancel"
        >
          <X className="size-4" />
        </button>
      </form>
    </motion.li>
  );
}

function MoveDialog({
  row,
  rows,
  busy,
  onClose,
  onMove,
}: {
  row: TreeRow | null;
  rows: TreeRow[];
  busy: boolean;
  onClose: () => void;
  onMove: (parentId: string | null) => Promise<void>;
}) {
  const [target, setTarget] = useState<string>('');
  useEffect(() => setTarget(row?.parentId ?? ''), [row]);

  const blocked = useMemo(() => (row ? subtreeIds(rows, row.id) : new Set<string>()), [row, rows]);
  const choices = rows.filter((r) => r.isActive && !blocked.has(r.id));

  return (
    <Modal
      open={row !== null}
      onClose={onClose}
      title={`Move “${row?.name ?? ''}”`}
      description="Pick its new parent. Sub-categories and products move along with it."
      icon={
        <div className="grid size-11 shrink-0 place-items-center rounded-full bg-emerald-50">
          <FolderInput className="size-5 text-emerald-600" />
        </div>
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={busy}
            disabled={(row?.parentId ?? '') === target}
            onClick={() => void onMove(target || null)}
          >
            Move here
          </Button>
        </>
      }
    >
      <label htmlFor="move-target" className="mb-1.5 block text-sm font-medium text-slate-700">
        New parent
      </label>
      <select
        id="move-target"
        value={target}
        onChange={(e) => setTarget(e.target.value)}
        className={inputClass()}
      >
        <option value="">— Top level —</option>
        {choices.map((c) => (
          <option key={c.id} value={c.id}>
            {'   '.repeat(c.depth)}
            {c.name}
          </option>
        ))}
      </select>
    </Modal>
  );
}

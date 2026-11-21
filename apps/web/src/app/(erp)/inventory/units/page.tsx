'use client';

import { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import type { SaveUnitRequest, UnitDto } from '@erp/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { errorMessage } from '@/lib/errors';
import { useApiQuery } from '@/lib/use-api';
import { Button, IconButton } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/data-table';
import { TextField } from '@/components/ui/form';
import { ConfirmDialog, Modal } from '@/components/ui/modal';
import { PageHeader, RequirePermission } from '@/components/ui/page';
import { useToast } from '@/components/ui/toast';

export default function UnitsPage() {
  return (
    <RequirePermission permission="inventory.product.read">
      <UnitsScreen />
    </RequirePermission>
  );
}

function UnitsScreen() {
  const { t } = useI18n();
  const { can } = useAuth();
  const toast = useToast();
  const canWrite = can('inventory.product.write');
  const units = useApiQuery<UnitDto[]>('/units');
  const [editing, setEditing] = useState<UnitDto | 'new' | null>(null);
  const [deleting, setDeleting] = useState<UnitDto | null>(null);

  const columns: Column<UnitDto>[] = [
    {
      key: 'code',
      header: t('units.col.code'),
      cell: (u) => <code className="font-semibold text-slate-900">{u.code}</code>,
    },
    { key: 'name', header: t('units.col.name'), cell: (u) => u.name },
    {
      key: 'products',
      header: t('units.col.products'),
      align: 'right',
      cell: (u) => <span className="text-slate-500">{u.productCount}</span>,
    },
    ...(canWrite
      ? [
          {
            key: 'actions',
            header: '',
            align: 'right' as const,
            cell: (u: UnitDto) => (
              <div className="flex justify-end gap-0.5">
                <IconButton icon={Pencil} label={t('common.edit')} onClick={() => setEditing(u)} />
                <IconButton
                  icon={Trash2}
                  tone="danger"
                  label={u.productCount > 0 ? t('units.cannotDelete') : t('common.delete')}
                  disabled={u.productCount > 0}
                  onClick={() => setDeleting(u)}
                />
              </div>
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        href="/inventory/units"
        actions={
          canWrite && (
            <Button icon={Plus} onClick={() => setEditing('new')}>
              {t('units.new')}
            </Button>
          )
        }
      />
      <DataTable
        columns={columns}
        rows={units.data}
        rowKey={(u) => u.id}
        loading={units.loading}
        error={units.error ? errorMessage(units.error, t) : null}
        onRetry={units.reload}
      />
      <p className="text-xs text-slate-500">{t('units.help')}</p>

      {editing && (
        <UnitModal
          unit={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(u) => {
            toast.success(
              t(editing === 'new' ? 'units.created' : 'units.updated', { code: u.code }),
            );
            setEditing(null);
            void units.reload();
          }}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        title={t('units.delete')}
        message={t('units.confirmDelete', { code: deleting?.code ?? '' })}
        confirmLabel={t('common.delete')}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await api(`/units/${deleting.id}`, { method: 'DELETE' });
            toast.success(t('units.deleted', { code: deleting.code }));
            setDeleting(null);
            void units.reload();
          } catch (err) {
            toast.error(errorMessage(err, t));
          }
        }}
      />
    </div>
  );
}

function UnitModal({
  unit,
  onClose,
  onSaved,
}: {
  unit: UnitDto | null;
  onClose: () => void;
  onSaved: (u: UnitDto) => void;
}) {
  const { t } = useI18n();
  const [code, setCode] = useState(unit?.code ?? '');
  const [name, setName] = useState(unit?.name ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    const c = code.trim().toUpperCase();
    if (!/^[A-Z0-9]{1,10}$/.test(c)) return setError(t('units.form.codeInvalid'));
    if (!name.trim()) return setError(t('validation.required'));
    setSaving(true);
    setError(null);
    const body: SaveUnitRequest = { code: c, name: name.trim() };
    try {
      onSaved(
        await api<UnitDto>(unit ? `/units/${unit.id}` : '/units', {
          method: unit ? 'PATCH' : 'POST',
          body: JSON.stringify(body),
        }),
      );
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
      title={unit ? t('units.edit') : t('units.new')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="unit-form" loading={saving}>
            {unit ? t('common.save') : t('common.create')}
          </Button>
        </>
      }
    >
      <form id="unit-form" onSubmit={submit} className="space-y-4" noValidate>
        <TextField
          label={t('units.form.code')}
          required
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          hint={t('units.form.codeHint')}
          className="font-mono"
          maxLength={10}
        />
        <TextField
          label={t('units.form.name')}
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('units.form.namePlaceholder')}
        />
        {error && (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}

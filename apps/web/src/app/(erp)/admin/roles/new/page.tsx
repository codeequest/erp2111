'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Plus } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { ForbiddenState } from '@/components/admin/forbidden-state';
import { PageHeader } from '@/components/admin/page-header';
import { RoleForm } from '@/components/admin/roles/role-form';

function NewRoleInner() {
  const { can } = useAuth();
  const cloneFrom = useSearchParams().get('cloneFrom') ?? undefined;
  if (!can('admin.role.create')) return <ForbiddenState permission="admin.role.create" />;
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        icon={Plus}
        title="New role"
        description="Start blank, copy an existing role or use a template."
        trail={[{ label: 'Roles', href: '/admin/roles' }, { label: 'New' }]}
      />
      <RoleForm initialCloneId={cloneFrom} />
    </div>
  );
}

export default function NewRolePage() {
  return (
    <Suspense>
      <NewRoleInner />
    </Suspense>
  );
}

'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, Pencil } from 'lucide-react';
import type { UserDetail } from '@erp/shared';
import { api, ApiRequestError, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { btnSecondary } from '@/components/admin/buttons';
import { EmptyState } from '@/components/admin/empty-state';
import { ForbiddenState } from '@/components/admin/forbidden-state';
import { PageHeader } from '@/components/admin/page-header';
import { Skeleton } from '@/components/admin/skeleton';
import { UserForm } from '@/components/admin/users/user-form';

export default function EditUserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { can } = useAuth();
  const [user, setUser] = useState<UserDetail | null>(null);
  const [error, setError] = useState<{ status?: number; message: string } | null>(null);

  useEffect(() => {
    api<UserDetail>(`/users/${id}`)
      .then(setUser)
      .catch((e) =>
        setError({
          status: e instanceof ApiRequestError ? e.status : undefined,
          message: errorMessage(e),
        }),
      );
  }, [id]);

  if (!can('admin.user.update') || error?.status === 403)
    return <ForbiddenState permission="admin.user.update" />;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        icon={Pencil}
        title={user ? `Edit ${user.fullName}` : 'Edit user'}
        description="Profile, roles and security requirements."
        trail={[
          { label: 'Users', href: '/admin/users' },
          { label: user?.fullName ?? '…', href: `/admin/users/${id}` },
          { label: 'Edit' },
        ]}
      />
      {error ? (
        <EmptyState
          icon={AlertCircle}
          tone="rose"
          title={error.status === 404 ? 'User not found' : "Couldn't load this user"}
          description={error.message}
          action={
            <Link href="/admin/users" className={btnSecondary}>
              Back to users
            </Link>
          }
        />
      ) : user ? (
        <UserForm user={user} />
      ) : (
        <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
          <Skeleton className="h-96" />
          <Skeleton className="h-72" />
        </div>
      )}
    </div>
  );
}

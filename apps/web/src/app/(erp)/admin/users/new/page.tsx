'use client';

import { MailPlus } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { ForbiddenState } from '@/components/admin/forbidden-state';
import { PageHeader } from '@/components/admin/page-header';
import { UserForm } from '@/components/admin/users/user-form';

export default function NewUserPage() {
  const { can } = useAuth();
  if (!can('admin.user.create')) return <ForbiddenState permission="admin.user.create" />;
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        icon={MailPlus}
        title="Invite a user"
        description="They'll get an email to choose their own password. You never see it."
        trail={[{ label: 'Users', href: '/admin/users' }, { label: 'New' }]}
      />
      <UserForm />
    </div>
  );
}

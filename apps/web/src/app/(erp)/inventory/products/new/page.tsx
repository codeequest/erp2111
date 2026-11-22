'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { AccessDenied, Breadcrumbs } from '@/components/page-header';
import { ProductForm } from '@/components/product-form';

export default function NewProductPage() {
  const { can } = useAuth();
  const router = useRouter();

  if (!can('inventory.product.write')) {
    return <AccessDenied permission="inventory.product.write" what="New product" />;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Breadcrumbs
          items={[
            { label: 'Home', href: '/dashboard' },
            { label: 'Inventory' },
            { label: 'Products', href: '/inventory/products' },
            { label: 'New' },
          ]}
        />
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">New product</h1>
      </div>
      <ProductForm
        onSaved={(p) => router.replace(`/inventory/products/${p.id}?created=1`)}
        onCancel={() => router.push('/inventory/products')}
      />
    </div>
  );
}

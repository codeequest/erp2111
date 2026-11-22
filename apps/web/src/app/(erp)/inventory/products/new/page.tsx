'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { ProductForm } from '@/components/products/product-form';
import { Breadcrumbs, ErrorBox } from '@/components/products/ui';

export default function NewProductPage() {
  const router = useRouter();
  const { can } = useAuth();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Breadcrumbs trail={[{ label: 'Products', href: '/inventory/products' }, { label: 'New' }]} />
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">New product</h1>
      </div>
      {can('inventory.product.write') ? (
        <ProductForm
          cancelHref="/inventory/products"
          onSaved={(p) => router.push(`/inventory/products/${p.id}`)}
        />
      ) : (
        <ErrorBox message="You need the inventory.product.write permission to create products." />
      )}
    </div>
  );
}

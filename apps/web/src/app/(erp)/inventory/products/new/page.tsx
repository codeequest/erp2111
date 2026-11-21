'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Lock } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { inventoryApi } from '@/lib/inventory';
import { ProductsHeader } from '@/components/inventory/products-header';
import { ProductForm } from '@/components/inventory/product-form';

export default function NewProductPage() {
  const { can } = useAuth();
  const router = useRouter();

  if (!can('inventory.product.write')) {
    return (
      <div className="mx-auto mt-16 max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center">
        <Lock className="mx-auto size-8 text-slate-400" />
        <h1 className="mt-3 text-lg font-semibold text-slate-900">Access denied</h1>
        <p className="mt-1 text-sm text-slate-500">
          Creating products needs the{' '}
          <code className="rounded bg-slate-100 px-1">inventory.product.write</code> permission.
        </p>
        <Link
          href="/inventory/products"
          className="mt-5 inline-block text-sm font-medium text-emerald-700 hover:underline"
        >
          Back to products
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <ProductsHeader
        title="New product"
        subtitle="Add an item you buy, stock or sell"
        crumbs={[{ label: 'New' }]}
      />
      <ProductForm
        submitLabel="Create product"
        onSubmit={inventoryApi.createProduct}
        onSaved={(p, warning) =>
          router.push(
            `/inventory/products/${p.id}${warning ? `?warning=${encodeURIComponent(warning)}` : ''}`,
          )
        }
        onCancel={() => router.push('/inventory/products')}
      />
    </div>
  );
}

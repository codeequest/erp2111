'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { inventoryApi, type ProductFormOptions } from '@/lib/inventory';
import { AccessDenied, Breadcrumb, ErrorNotice } from '@/components/inventory/ui';
import { ProductForm } from '@/components/inventory/product-form';

export default function NewProductPage() {
  const { can } = useAuth();
  const allowed = can('inventory.product.write');
  const [options, setOptions] = useState<ProductFormOptions | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (allowed)
      inventoryApi
        .formOptions()
        .then(setOptions)
        .catch((e: Error) => setError(e.message));
  }, [allowed]);

  if (!allowed) return <AccessDenied permission="inventory.product.write" what="create products" />;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <Breadcrumb
          items={[
            { label: 'Inventory' },
            { label: 'Products', href: '/inventory/products' },
            { label: 'New' },
          ]}
        />
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">New product</h1>
        <p className="text-sm text-slate-500">
          Fields marked * are required. Everything else can be added later.
        </p>
      </div>
      {error && <ErrorNotice message={error} />}
      {options ? (
        <ProductForm product={null} options={options} onOptionsChange={setOptions} />
      ) : (
        !error && (
          <div className="grid place-items-center py-20 text-slate-400">
            <Loader2 className="size-6 animate-spin" />
          </div>
        )
      )}
    </div>
  );
}

'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import type { ProductDetail } from '@erp/shared';
import { api } from '@/lib/api';
import { PermissionGate } from '@/components/permission-gate';
import { ProductForm } from '@/components/products/product-form';
import { Breadcrumbs, ErrorBox, PageLoader } from '@/components/ui';

/** /inventory/products/new — or /inventory/products/new?from=<id> to duplicate a product. */
export default function NewProductPage() {
  return (
    <PermissionGate permission="inventory.product.write">
      <Suspense fallback={<PageLoader />}>
        <NewProduct />
      </Suspense>
    </PermissionGate>
  );
}

function NewProduct() {
  const from = useSearchParams().get('from');
  const [source, setSource] = useState<ProductDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!from) return;
    api<ProductDetail>(`/inventory/products/${from}`)
      .then(setSource)
      .catch((e: Error) => setError(e.message));
  }, [from]);

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <Breadcrumbs
          items={[
            { label: 'Home', href: '/dashboard' },
            { label: 'Inventory' },
            { label: 'Products', href: '/inventory/products' },
            { label: from ? 'Duplicate' : 'New' },
          ]}
        />
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">
          {from ? `Duplicate ${source?.name ?? 'product'}` : 'New product'}
        </h1>
        {from && (
          <p className="text-sm text-slate-500">
            Everything is copied except the SKU and barcodes, which must be unique.
          </p>
        )}
      </div>
      {error ? (
        <ErrorBox message={error} />
      ) : from && !source ? (
        <PageLoader />
      ) : (
        <ProductForm
          key={source?.id ?? 'new'}
          product={source ?? undefined}
          mode={from ? 'duplicate' : 'create'}
        />
      )}
    </div>
  );
}

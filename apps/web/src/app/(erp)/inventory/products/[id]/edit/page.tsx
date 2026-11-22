'use client';

import { use, useEffect, useState } from 'react';
import type { ProductDetail } from '@erp/shared';
import { api } from '@/lib/api';
import { PermissionGate } from '@/components/permission-gate';
import { ProductForm } from '@/components/products/product-form';
import { Breadcrumbs, ErrorBox, PageLoader } from '@/components/ui';

export default function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<ProductDetail>(`/inventory/products/${id}`)
      .then(setProduct)
      .catch((e: Error) => setError(e.message));
  }, [id]);

  return (
    <PermissionGate permission="inventory.product.write">
      <div className="mx-auto max-w-5xl space-y-4">
        <div>
          <Breadcrumbs
            items={[
              { label: 'Home', href: '/dashboard' },
              { label: 'Inventory' },
              { label: 'Products', href: '/inventory/products' },
              { label: product?.sku ?? '…', href: `/inventory/products/${id}` },
              { label: 'Edit' },
            ]}
          />
          <h1 className="mt-2 text-2xl font-semibold text-slate-900">
            Edit {product?.name ?? 'product'}
          </h1>
        </div>
        {error ? (
          <ErrorBox message={error} />
        ) : !product ? (
          <PageLoader />
        ) : (
          <ProductForm product={product} mode="edit" />
        )}
      </div>
    </PermissionGate>
  );
}

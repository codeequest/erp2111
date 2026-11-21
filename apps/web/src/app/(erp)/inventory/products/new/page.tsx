'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createProduct } from '@/lib/inventory';
import { ProductForm } from '@/components/inventory/product-form';
import { PageHeader, RequirePermission } from '@/components/inventory/ui';

export default function NewProductPage() {
  return (
    <RequirePermission permission="inventory.product.write">
      <Suspense>
        <NewProduct />
      </Suspense>
    </RequirePermission>
  );
}

function NewProduct() {
  const router = useRouter();
  // Set when coming from a scan of an unknown barcode: /inventory/products/new?barcode=…
  const barcode = useSearchParams().get('barcode') ?? undefined;
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title="New product" crumbs={[{ label: 'New' }]} />
      <ProductForm
        submitLabel="Create product"
        initialBarcode={barcode}
        onCancel={() => router.push('/inventory/products')}
        onSubmit={async (input) => {
          const p = await createProduct(input);
          router.push(`/inventory/products/${p.id}`);
        }}
      />
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import type { ProductDetail } from '@erp/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { ProductForm } from '@/components/products/product-form';
import { Breadcrumbs, ErrorBox } from '@/components/products/ui';

export default function EditProductPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { can } = useAuth();
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<ProductDetail>(`/inventory/products/${id}`)
      .then(setProduct)
      .catch((e: Error) => setError(e.message));
  }, [id]);

  const detailHref = `/inventory/products/${id}`;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Breadcrumbs
          trail={[
            { label: 'Products', href: '/inventory/products' },
            { label: product?.name ?? '…', href: detailHref },
            { label: 'Edit' },
          ]}
        />
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Edit product</h1>
      </div>
      {!can('inventory.product.write') ? (
        <ErrorBox message="You need the inventory.product.write permission to edit products." />
      ) : error ? (
        <ErrorBox message={error} />
      ) : !product ? (
        <Loader2 className="mx-auto size-6 animate-spin text-slate-400" />
      ) : (
        <ProductForm product={product} cancelHref={detailHref} onSaved={() => router.push(detailHref)} />
      )}
    </div>
  );
}

'use client';

import { use, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { PencilLine } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { productsApi, type ProductDetail } from '@/lib/products';
import { ProductForm } from '@/components/product-form';
import { Breadcrumbs, Skeleton } from '@/components/ui';

export default function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { can } = useAuth();
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    productsApi.get(id).then(setProduct).catch((e: Error) => setError(e.message));
  }, [id]);

  if (!can('inventory.product.write')) {
    return <p className="mx-auto mt-16 max-w-md text-center text-sm text-slate-500">You need inventory.product.write to edit products.</p>;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
        <Breadcrumbs
          items={[
            { label: 'Home', href: '/dashboard' },
            { label: 'Products', href: '/inventory/products' },
            ...(product ? [{ label: product.name, href: `/inventory/products/${id}` }] : []),
            { label: 'Edit' },
          ]}
        />
        <div className="mt-2 flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-600/25">
            <PencilLine className="size-5" />
          </div>
          <div>
            {product ? (
              <h1 className="text-2xl font-semibold text-slate-900">Edit {product.name}</h1>
            ) : (
              <Skeleton className="h-7 w-56" />
            )}
            {product?.hasVariants && (
              <p className="text-sm text-slate-500">
                Category, unit, tax and description are applied to all {product.variants.length} variants.
              </p>
            )}
          </div>
        </div>
      </motion.div>
      {error ? (
        <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>
      ) : product ? (
        <ProductForm product={product} />
      ) : (
        <Skeleton className="h-96 rounded-2xl" />
      )}
    </div>
  );
}

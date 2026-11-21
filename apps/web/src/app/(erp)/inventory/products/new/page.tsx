'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { ProductForm } from '@/components/inventory/product-form';
import { ProductHeader } from '@/components/inventory/product-header';
import { AccessDenied } from '@/components/ui';

export default function NewProductPage() {
  const router = useRouter();
  const { can } = useAuth();
  if (!can('inventory.product.write')) {
    return <AccessDenied permission="inventory.product.write" what="product creation" />;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <ProductHeader
        title="New product"
        subtitle="Fill in the essentials; you can refine it later."
      />
      <ProductForm
        product={null}
        cancelHref="/inventory/products"
        onSaved={(p) => router.replace(`/inventory/products/${p.id}?created=1`)}
      />
    </div>
  );
}

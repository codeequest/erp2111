'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2 } from 'lucide-react';
import type { ProductFormOptions } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { productsApi } from '@/lib/inventory';
import { AccessDenied } from '@/components/access-denied';
import { ProductForm } from '@/components/inventory/product-form';
import { ProductsHeader } from '@/components/inventory/products-header';

export default function NewProductPage() {
  const { can } = useAuth();
  const allowed = can('inventory.product.write');
  const [options, setOptions] = useState<ProductFormOptions | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!allowed) return;
    productsApi.options().then(setOptions, (e: Error) => setError(e.message));
  }, [allowed]);

  if (!allowed) return <AccessDenied permission="inventory.product.write" what="create products" />;

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-10">
      <ProductsHeader
        title="New product"
        subtitle="Fields marked * are required. Everything else can be filled in later."
        crumb="New"
        showTabs={false}
        actions={
          <Link
            href="/inventory/products"
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-emerald-50 ring-1 ring-white/30 transition hover:bg-white/10"
          >
            <ArrowLeft className="size-4" /> Back to list
          </Link>
        }
      />
      {error ? (
        <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>
      ) : !options ? (
        <div className="grid h-64 place-items-center text-slate-400">
          <Loader2 className="size-6 animate-spin" />
        </div>
      ) : (
        <ProductForm options={options} canCost={can('inventory.cost.view')} />
      )}
    </div>
  );
}

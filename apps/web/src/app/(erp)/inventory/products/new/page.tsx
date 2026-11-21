'use client';

import { motion } from 'framer-motion';
import { PackagePlus } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { ProductForm } from '@/components/product-form';
import { Breadcrumbs } from '@/components/ui';

export default function NewProductPage() {
  const { can } = useAuth();
  if (!can('inventory.product.write')) {
    return <p className="mx-auto mt-16 max-w-md text-center text-sm text-slate-500">You need inventory.product.write to create products.</p>;
  }
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
        <Breadcrumbs
          items={[
            { label: 'Home', href: '/dashboard' },
            { label: 'Products', href: '/inventory/products' },
            { label: 'New product' },
          ]}
        />
        <div className="mt-2 flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-600/25">
            <PackagePlus className="size-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">New product</h1>
            <p className="text-sm text-slate-500">Fields marked * are required</p>
          </div>
        </div>
      </motion.div>
      <ProductForm />
    </div>
  );
}

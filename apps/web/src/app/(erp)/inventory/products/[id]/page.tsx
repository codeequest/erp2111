'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'motion/react';
import { Archive, ArchiveRestore, ArrowLeft, Loader2, PackageX } from 'lucide-react';
import type { Product, ProductFormOptions } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { productsApi } from '@/lib/inventory';
import { formatQty } from '@/lib/format';
import { AccessDenied } from '@/components/access-denied';
import { ProductForm } from '@/components/inventory/product-form';
import { HeaderButton, ProductsHeader } from '@/components/inventory/products-header';
import { Button, Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';

export default function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { can } = useAuth();
  const toast = useToast();
  const canRead = can('inventory.product.read');
  const canWrite = can('inventory.product.write');

  const [product, setProduct] = useState<Product | null>(null);
  const [options, setOptions] = useState<ProductFormOptions | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  // Remount the form after archive/restore so it picks up fresh data.
  const [formKey, setFormKey] = useState(0);

  useEffect(() => {
    if (!canRead) return;
    Promise.all([productsApi.get(id), productsApi.options()]).then(
      ([p, o]) => {
        setProduct(p);
        setOptions(o);
      },
      (e: Error) => setError(e.message),
    );
  }, [id, canRead]);

  async function toggleArchive(archive: boolean) {
    if (!product) return;
    setBusy(true);
    try {
      const updated = archive
        ? await productsApi.archive(product.id)
        : await productsApi.restore(product.id);
      setProduct(updated);
      setFormKey((k) => k + 1);
      toast({
        kind: 'success',
        title: archive ? 'Product archived' : 'Product restored',
        description: updated.name,
        action: archive ? { label: 'Undo', onClick: () => void toggleArchive(false) } : undefined,
      });
    } catch (e) {
      toast({ kind: 'error', title: 'Could not update the product', description: String(e) });
    } finally {
      setBusy(false);
      setConfirmOpen(false);
    }
  }

  if (!canRead) return <AccessDenied permission="inventory.product.read" what="view products" />;

  if (error) {
    return (
      <div className="mx-auto mt-16 max-w-md rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200">
        <PackageX className="mx-auto size-10 text-slate-300" />
        <h1 className="mt-3 font-semibold text-slate-900">Product not available</h1>
        <p className="mt-1 text-sm text-slate-500">{error}</p>
        <Link
          href="/inventory/products"
          className="mt-4 inline-block text-sm font-medium text-emerald-700 hover:underline"
        >
          Back to products
        </Link>
      </div>
    );
  }

  if (!product || !options) {
    return (
      <div className="grid h-80 place-items-center text-slate-400">
        <Loader2 className="size-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-10">
      <ProductsHeader
        title={product.name}
        subtitle={`${product.sku} · ${formatQty(product.onHand)} ${product.baseUnit.code} on hand`}
        crumb={product.sku}
        showTabs={false}
        actions={
          <>
            <Link
              href="/inventory/products"
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-emerald-50 ring-1 ring-white/30 transition hover:bg-white/10"
            >
              <ArrowLeft className="size-4" /> Back
            </Link>
            {canWrite &&
              (product.isActive ? (
                <HeaderButton onClick={() => setConfirmOpen(true)} className="!text-rose-600">
                  <Archive className="size-4" /> Archive
                </HeaderButton>
              ) : (
                <HeaderButton onClick={() => void toggleArchive(false)} disabled={busy}>
                  <ArchiveRestore className="size-4" /> Restore
                </HeaderButton>
              ))}
          </>
        }
      />

      <AnimatePresence>
        {!product.isActive && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-gradient-to-r from-amber-50 to-orange-50 px-5 py-4 ring-1 ring-amber-200">
              <Archive className="size-5 text-amber-600" />
              <p className="flex-1 text-sm text-amber-900">
                This product is <strong>archived</strong>. It can&apos;t be added to new orders or
                invoices. Restore it to edit and sell it again.
              </p>
              {canWrite && (
                <Button
                  variant="secondary"
                  loading={busy}
                  onClick={() => void toggleArchive(false)}
                >
                  <ArchiveRestore className="size-4" /> Restore
                </Button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <ProductForm
        key={formKey}
        options={options}
        product={product}
        canCost={can('inventory.cost.view')}
        readOnly={!canWrite || !product.isActive}
        onSaved={setProduct}
      />

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Archive this product?"
        icon={
          <div className="grid size-11 shrink-0 place-items-center rounded-full bg-rose-50">
            <Archive className="size-5 text-rose-600" />
          </div>
        }
        description={
          <>
            <span className="font-medium text-slate-700">{product.name}</span> will be hidden from
            new orders and invoices. Its history is kept and you can restore it at any time.
          </>
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" loading={busy} onClick={() => void toggleArchive(true)}>
              Archive
            </Button>
          </>
        }
      />
    </div>
  );
}

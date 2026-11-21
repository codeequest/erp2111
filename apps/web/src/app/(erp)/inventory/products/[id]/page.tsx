'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Printer } from 'lucide-react';
import type { ProductDetail } from '@erp/shared';
import { useI18n } from '@/lib/i18n';
import { errorMessage } from '@/lib/errors';
import { useApiQuery } from '@/lib/use-api';
import { Button } from '@/components/ui/button';
import { Badge, PageHeader, RequirePermission } from '@/components/ui/page';
import { ProductForm } from '../product-form';

export default function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <RequirePermission permission="inventory.product.read">
      <ProductScreen id={id} />
    </RequirePermission>
  );
}

function ProductScreen({ id }: { id: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const query = useApiQuery<ProductDetail>(`/products/${id}`);
  // Saved versions replace the loaded one without a reload.
  const [product, setProduct] = useState<ProductDetail | null>(null);
  // Remount the form when the saved product changes, so fields show stored values.
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (query.data) setProduct(query.data);
  }, [query.data]);

  if (query.error) {
    return (
      <div className="py-24 text-center">
        <p className="text-sm text-red-600">{errorMessage(query.error, t)}</p>
        <Button
          variant="secondary"
          className="mt-4"
          icon={ArrowLeft}
          onClick={() => router.push('/inventory/products')}
        >
          {t('common.back')}
        </Button>
      </div>
    );
  }
  if (!product) {
    return (
      <div className="flex justify-center py-24 text-slate-400">
        <Loader2 className="size-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        href="/inventory/products"
        title={product.name}
        crumb={product.sku}
        description={`${t('products.col.sku')} ${product.sku}`}
        actions={
          <>
            {!product.isActive && <Badge>{t('status.inactive')}</Badge>}
            <Button
              variant="secondary"
              icon={Printer}
              onClick={() => router.push(`/inventory/labels?ids=${product.id}`)}
            >
              {t('labels.button')}
            </Button>
            <Button
              variant="secondary"
              icon={ArrowLeft}
              onClick={() => router.push('/inventory/products')}
            >
              {t('common.back')}
            </Button>
          </>
        }
      />
      <ProductForm
        key={version}
        product={product}
        onSaved={(saved) => {
          setProduct(saved);
          setVersion((v) => v + 1);
        }}
      />
    </div>
  );
}

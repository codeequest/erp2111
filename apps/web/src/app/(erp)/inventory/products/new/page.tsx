'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { PageHeader, RequirePermission } from '@/components/ui/page';
import { ProductForm } from '../product-form';

export default function NewProductPage() {
  const { t } = useI18n();
  const router = useRouter();
  return (
    <RequirePermission permission="inventory.product.write">
      <div className="mx-auto max-w-5xl space-y-6">
        <PageHeader
          href="/inventory/products"
          title={t('products.new')}
          crumb={t('products.new')}
          description={t('products.newHelp')}
          actions={
            <Button
              variant="secondary"
              icon={ArrowLeft}
              onClick={() => router.push('/inventory/products')}
            >
              {t('common.back')}
            </Button>
          }
        />
        <ProductForm product={null} />
      </div>
    </RequirePermission>
  );
}

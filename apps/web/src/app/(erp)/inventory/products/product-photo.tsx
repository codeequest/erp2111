'use client';

import { useRef, useState } from 'react';
import { ImagePlus, Package, Trash2 } from 'lucide-react';
import { PRODUCT_PHOTO_MAX_BYTES, PRODUCT_PHOTO_TYPES, type ProductDetail } from '@erp/shared';
import { api, ApiRequestError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { errorMessage } from '@/lib/errors';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/page';
import { useToast } from '@/components/ui/toast';

/**
 * Photo of an existing product. Upload and removal are saved immediately and do
 * not touch the rest of the form, so unsaved edits are kept.
 */
export function ProductPhoto({ product }: { product: ProductDetail }) {
  const { t } = useI18n();
  const { can } = useAuth();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState(product.photoUrl);
  const [busy, setBusy] = useState(false);
  const canWrite = can('inventory.product.write');

  async function upload(file: File | undefined) {
    if (!file) return;
    if (!(PRODUCT_PHOTO_TYPES as readonly string[]).includes(file.type)) {
      toast.error(t('photo.badType'));
      return;
    }
    if (file.size > PRODUCT_PHOTO_MAX_BYTES) {
      toast.error(t('photo.tooBig'));
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      // No Content-Type header: the browser sets the multipart boundary.
      const saved = await api<ProductDetail>(`/products/${product.id}/photo`, {
        method: 'POST',
        body: form,
      });
      setUrl(saved.photoUrl);
      toast.success(t('photo.saved'));
    } catch (err) {
      toast.error(
        err instanceof ApiRequestError && err.status === 413
          ? t('photo.tooBig')
          : errorMessage(err, t),
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await api(`/products/${product.id}/photo`, { method: 'DELETE' });
      setUrl(null);
      toast.success(t('photo.removed'));
    } catch (err) {
      toast.error(errorMessage(err, t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title={t('photo.title')}>
      <div className="flex flex-wrap items-center gap-5">
        <div className="grid size-32 shrink-0 place-items-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element -- served by the API
            <img src={url} alt={product.name} className="size-full object-contain" />
          ) : (
            <Package className="size-10 text-slate-300" />
          )}
        </div>
        <div className="space-y-2">
          {canWrite && (
            <div className="flex flex-wrap gap-2">
              <input
                ref={input}
                type="file"
                accept={PRODUCT_PHOTO_TYPES.join(',')}
                className="hidden"
                onChange={(e) => {
                  void upload(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
              <Button
                variant="secondary"
                icon={ImagePlus}
                loading={busy}
                onClick={() => input.current?.click()}
              >
                {url ? t('photo.replace') : t('photo.add')}
              </Button>
              {url && (
                <Button
                  variant="ghost"
                  icon={Trash2}
                  disabled={busy}
                  className="text-red-600 hover:bg-red-50 hover:text-red-700"
                  onClick={remove}
                >
                  {t('common.delete')}
                </Button>
              )}
            </div>
          )}
          <p className="text-xs text-slate-500">{t('photo.help')}</p>
        </div>
      </div>
    </Card>
  );
}

'use client';

import { useRef, useState } from 'react';
import { ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { removeProductImage, resizeImage, uploadProductImage } from '@/lib/inventory';
import { ProductThumb } from './product-thumb';

/** Product photo with upload / replace / remove (resized in the browser before upload). */
export function ProductPhoto({
  product,
  canWrite,
  onChange,
}: {
  product: { id: string; name: string; imageUpdatedAt: string | null };
  canWrite: boolean;
  onChange: (imageUpdatedAt: string | null) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const dataUrl = await resizeImage(file);
      const res = await uploadProductImage(product.id, dataUrl);
      onChange(res.imageUpdatedAt);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm('Remove the photo of this product?')) return;
    setBusy(true);
    setError(null);
    try {
      onChange((await removeProductImage(product.id)).imageUpdatedAt);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="relative aspect-square overflow-hidden rounded-lg">
        <ProductThumb product={product} size="lg" />
        {busy && (
          <div className="absolute inset-0 grid place-items-center bg-white/70">
            <Loader2 className="size-6 animate-spin text-slate-500" />
          </div>
        )}
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      {canWrite && (
        <div className="mt-3 flex gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              void upload(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          <button
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            <ImagePlus className="size-4" /> {product.imageUpdatedAt ? 'Replace' : 'Add photo'}
          </button>
          {product.imageUpdatedAt && (
            <button
              aria-label="Remove photo"
              className="rounded-md border border-slate-200 px-2.5 text-slate-500 hover:bg-red-50 hover:text-red-600"
              disabled={busy}
              onClick={() => void remove()}
            >
              <Trash2 className="size-4" />
            </button>
          )}
        </div>
      )}
    </section>
  );
}

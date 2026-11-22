'use client';

import { useRef, useState } from 'react';
import clsx from 'clsx';
import { ImageIcon, Loader2, Trash2, Upload } from 'lucide-react';
import type { ProductDetail } from '@erp/shared';
import { api } from '@/lib/api';
import { ErrorBox, btnSecondary } from './ui';

const MAX_BYTES = 2 * 1024 * 1024;
const ACCEPT = 'image/jpeg,image/png,image/webp';

/** Product photo with upload / replace / remove. */
export function ProductImageCard({
  product,
  canWrite,
  onSaved,
}: {
  product: ProductDetail;
  canWrite: boolean;
  onSaved: (p: ProductDetail) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  async function upload(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (!ACCEPT.split(',').includes(file.type)) return setError('Choose a JPEG, PNG or WebP image');
    if (file.size > MAX_BYTES) return setError('The image must be 2 MB or smaller');
    const body = new FormData();
    body.append('file', file);
    setBusy(true);
    try {
      onSaved(
        await api<ProductDetail>(`/inventory/products/${product.id}/image`, {
          method: 'POST',
          body,
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      onSaved(
        await api<ProductDetail>(`/inventory/products/${product.id}/image`, { method: 'DELETE' }),
      );
      setConfirmRemove(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="mb-3 text-sm font-semibold text-slate-900">Photo</h2>
      <div
        className={clsx(
          'relative grid aspect-square w-full place-items-center overflow-hidden rounded-lg bg-slate-50',
          !product.imageUrl && 'border border-dashed border-slate-300',
        )}
      >
        {product.imageUrl ? (
          <img src={product.imageUrl} alt={product.name} className="size-full object-contain" />
        ) : (
          <div className="flex flex-col items-center text-slate-400">
            <ImageIcon className="size-8" />
            <span className="mt-1 text-xs">No photo</span>
          </div>
        )}
        {busy && (
          <div className="absolute inset-0 grid place-items-center bg-white/70">
            <Loader2 className="size-6 animate-spin text-slate-500" />
          </div>
        )}
      </div>

      {error && (
        <div className="mt-3">
          <ErrorBox message={error} />
        </div>
      )}

      {canWrite && (
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => {
              void upload(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          <button
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className={clsx(btnSecondary, 'px-2 py-1 text-xs')}
          >
            <Upload className="size-3.5" /> {product.imageUrl ? 'Replace' : 'Upload'}
          </button>
          {product.imageUrl &&
            (confirmRemove ? (
              <span className="flex items-center gap-1 text-xs text-slate-600">
                Remove?
                <button
                  onClick={remove}
                  disabled={busy}
                  className="rounded bg-red-600 px-2 py-1 font-medium text-white hover:bg-red-700"
                >
                  Yes
                </button>
                <button
                  onClick={() => setConfirmRemove(false)}
                  className="rounded px-2 py-1 hover:bg-slate-100"
                >
                  No
                </button>
              </span>
            ) : (
              <button
                onClick={() => setConfirmRemove(true)}
                disabled={busy}
                className={clsx(btnSecondary, 'px-2 py-1 text-xs')}
              >
                <Trash2 className="size-3.5" /> Remove
              </button>
            ))}
          <p className="w-full text-xs text-slate-500">JPEG, PNG or WebP, up to 2 MB.</p>
        </div>
      )}
    </section>
  );
}

'use client';

import clsx from 'clsx';
import { Package } from 'lucide-react';
import { productImageUrl } from '@/lib/inventory';

/** Square product photo, or a neutral placeholder icon. */
export function ProductThumb({
  product,
  size = 'sm',
}: {
  product: { id: string; name: string; imageUpdatedAt: string | null };
  size?: 'sm' | 'lg';
}) {
  const url = productImageUrl(product);
  const box = size === 'sm' ? 'size-9' : 'size-full';
  if (!url) {
    return (
      <div className={clsx('grid shrink-0 place-items-center rounded-md bg-slate-100', box)}>
        <Package className={clsx('text-slate-300', size === 'sm' ? 'size-4' : 'size-12')} />
      </div>
    );
  }
  return (
    // Plain <img>: the API serves the bytes directly, there is nothing for next/image to optimise.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={product.name}
      loading="lazy"
      className={clsx('shrink-0 rounded-md bg-white object-cover', box)}
    />
  );
}

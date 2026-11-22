'use client';

import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { Package } from 'lucide-react';
import type { ProductType, StockStatus } from '@erp/shared';
import { apiBlob } from '@/lib/api';
import { Badge, formatQty } from '@/components/ui';

/**
 * Product picture. Images are protected by the API, so they are fetched with the
 * access token and shown from an object URL. `version` busts the cache after an upload.
 */
export function ProductImage({
  productId,
  hasImage,
  version,
  size = 'sm',
  className,
}: {
  productId: string;
  hasImage: boolean;
  version?: string;
  size?: 'sm' | 'lg';
  className?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!hasImage) {
      setUrl(null);
      return;
    }
    let objectUrl: string | null = null;
    let cancelled = false;
    apiBlob(`/inventory/products/${productId}/image`)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => setUrl(null));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [productId, hasImage, version]);

  const box = size === 'sm' ? 'size-10 rounded-md' : 'size-48 rounded-xl';
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element -- blob URL, next/image cannot optimise it
    <img
      src={url}
      alt=""
      className={clsx(box, 'border border-slate-200 bg-white object-contain', className)}
    />
  ) : (
    <div
      className={clsx(
        box,
        'grid place-items-center border border-slate-200 bg-slate-50 text-slate-300',
        className,
      )}
    >
      <Package className={size === 'sm' ? 'size-5' : 'size-12'} />
    </div>
  );
}

export function StockBadge({
  status,
  qty,
  unit,
}: {
  status: StockStatus;
  qty: string;
  unit?: string;
}) {
  if (status === 'none') return <span className="text-xs text-slate-400">Not tracked</span>;
  const tone = status === 'in' ? 'green' : status === 'low' ? 'amber' : 'red';
  const label = status === 'in' ? 'In stock' : status === 'low' ? 'Low' : 'Out of stock';
  return (
    <span className="flex flex-col items-end gap-0.5">
      <Badge tone={tone}>{label}</Badge>
      <span className="text-xs text-slate-500 tabular-nums">
        {formatQty(qty)} {unit}
      </span>
    </span>
  );
}

export function TypeBadge({ type }: { type: ProductType }) {
  if (type === 'STOCKABLE') return null;
  return <Badge tone="blue">{type === 'SERVICE' ? 'Service' : 'Consumable'}</Badge>;
}

export function MarginText({ value }: { value: string | null | undefined }) {
  if (value === undefined) return null;
  if (value === null) return <span className="text-slate-400">—</span>;
  const n = Number(value);
  return (
    <span
      className={clsx(
        'tabular-nums',
        n < 0 ? 'text-red-600' : n < 10 ? 'text-amber-600' : 'text-emerald-700',
      )}
    >
      {n.toFixed(1)}%
    </span>
  );
}

/** "12,5" → "12.5", " 1 000 " → "1000". Returns the trimmed text if it is not a number. */
export function normalizeDecimal(raw: string): string {
  const s = raw.trim().replace(/[\s ]/g, '');
  return /^\d+([.,]\d+)?$/.test(s) ? s.replace(',', '.') : s;
}

export const DECIMAL_RE = /^\d{1,14}(\.\d{1,4})?$/;

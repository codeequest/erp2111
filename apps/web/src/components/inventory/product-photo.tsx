'use client';

import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { ImageOff, Package } from 'lucide-react';
import { apiBlob } from '@/lib/api';

/**
 * Photos are protected by the API (the token lives in memory, so a plain <img src>
 * can't send it). We download them once as blobs and reuse the object URL.
 * Photo URLs carry a version, so a replaced photo gets a new URL and a fresh download.
 */
const cache = new Map<string, Promise<string>>();

function loadPhoto(url: string): Promise<string> {
  let p = cache.get(url);
  if (!p) {
    p = apiBlob(url).then((b) => URL.createObjectURL(b));
    p.catch(() => cache.delete(url)); // allow a retry later
    cache.set(url, p);
  }
  return p;
}

export function ProductPhoto({
  url,
  alt,
  className,
  iconClassName = 'size-1/3',
}: {
  url: string | null;
  alt: string;
  className?: string;
  iconClassName?: string;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setSrc(null);
    setFailed(false);
    if (url) {
      loadPhoto(url)
        .then((s) => active && setSrc(s))
        .catch(() => active && setFailed(true));
    }
    return () => {
      active = false;
    };
  }, [url]);

  return (
    <div
      className={clsx(
        'relative grid shrink-0 place-items-center overflow-hidden bg-gradient-to-br from-emerald-50 to-teal-100',
        className,
      )}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- blob URL, next/image can't optimise it
        <img
          src={src}
          alt={alt}
          className="animate-fade-in-up absolute inset-0 size-full object-cover"
        />
      ) : url && !failed ? (
        <div className="absolute inset-0 animate-pulse bg-emerald-100/60" />
      ) : failed ? (
        <ImageOff
          className={clsx('text-emerald-400', iconClassName)}
          aria-label="Photo unavailable"
        />
      ) : (
        <Package className={clsx('text-emerald-500/70', iconClassName)} aria-hidden />
      )}
    </div>
  );
}

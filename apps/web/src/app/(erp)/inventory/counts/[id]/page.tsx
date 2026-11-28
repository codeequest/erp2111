'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import type { StockCountDetail } from '@erp/shared';
import { api } from '@/lib/api';
import { ErrorBox } from '@/components/products/ui';
import { CountSheet } from '@/components/stock/count-sheet';

import { tr } from '@/lib/i18n';
export default function StockCountPage() {
  const { id } = useParams<{ id: string }>();
  const [doc, setDoc] = useState<StockCountDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<StockCountDetail>(`/inventory/counts/${id}`)
      .then(setDoc)
      .catch((e: Error) => setError(e.message));
  }, [id]);

  if (error) {
    return (
      <div className="mx-auto max-w-3xl">
        <ErrorBox message={error} />
      </div>
    );
  }
  if (!doc) {
    return (
      <p className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
        <Loader2 className="size-4 animate-spin" /> {' '}{tr("Loading…")}</p>
    );
  }
  return <CountSheet key={doc.id} initial={doc} />;
}

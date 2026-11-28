'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import type { TransferDetail } from '@erp/shared';
import { api } from '@/lib/api';
import { ErrorBox } from '@/components/products/ui';
import { TransferEditor } from '@/components/stock/transfer-editor';

import { tr } from '@/lib/i18n';
export default function TransferPage() {
  const { id } = useParams<{ id: string }>();
  const [doc, setDoc] = useState<TransferDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<TransferDetail>(`/inventory/transfers/${id}`)
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
  return <TransferEditor key={doc.id} initial={doc} />;
}

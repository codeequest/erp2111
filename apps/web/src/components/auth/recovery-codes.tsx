'use client';

import { useState } from 'react';
import { Check, Copy, Download } from 'lucide-react';
import { btnSecondary } from '@/components/admin/buttons';

/** Recovery codes shown once, with copy / download. */
export function RecoveryCodes({ codes }: { codes: string[] }) {
  const [copied, setCopied] = useState(false);
  const text = codes.join('\n');
  return (
    <div className="space-y-3">
      <div className="stagger grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-sm">
        {codes.map((c, i) => (
          <span
            key={c}
            style={{ '--i': i } as React.CSSProperties}
            className="rounded-md bg-white px-2 py-1.5 text-center tracking-wider text-slate-800 shadow-sm ring-1 ring-slate-200"
          >
            {c}
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          className={btnSecondary}
          onClick={async () => {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          {copied ? (
            <Check className="animate-pop size-4 text-emerald-600" />
          ) : (
            <Copy className="size-4" />
          )}
          {copied ? 'Copied' : 'Copy'}
        </button>
        <button
          type="button"
          className={btnSecondary}
          onClick={() => {
            const url = URL.createObjectURL(new Blob([text + '\n'], { type: 'text/plain' }));
            const a = document.createElement('a');
            a.href = url;
            a.download = 'erp-recovery-codes.txt';
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          }}
        >
          <Download className="size-4" />
          Download
        </button>
      </div>
      <p className="text-xs text-slate-500">
        Each code works once. Keep them somewhere safe — they let you in if you lose your phone.
      </p>
    </div>
  );
}

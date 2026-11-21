'use client';

import { useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileSpreadsheet, FileDown } from 'lucide-react';
import type { ImportProductsRequest, ImportProductsResult } from '@erp/shared';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { errorMessage, translateMessage } from '@/lib/errors';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';

const MAX_BYTES = 5 * 1024 * 1024;

/** Headers of the template, in the user's language (the API accepts both). */
const TEMPLATE = {
  fr: {
    header:
      'reference;designation;code_barre;categorie;unite;prix_vente;prix_achat;tva;description;actif',
    example: ";Jus d'orange 1 L;6191234567890;Boissons > Jus;PCS;1,250;0,900;19;;1",
    file: 'modele-import-produits.csv',
  },
  en: {
    header: 'sku;name;barcode;category;unit;sale_price;purchase_price;vat_rate;description;active',
    example: ';Orange juice 1 L;6191234567890;Drinks > Juice;PCS;1.250;0.900;19;;1',
    file: 'products-import-template.csv',
  },
};

/**
 * French Excel often saves CSV in Windows-1252, not UTF-8. Try UTF-8 first and
 * fall back so accents are not lost.
 */
async function readText(file: File): Promise<string> {
  const bytes = await file.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

export function ImportProductsModal({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: () => void;
}) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [csv, setCsv] = useState<string | null>(null);
  const [check, setCheck] = useState<ImportProductsResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send(body: ImportProductsRequest) {
    return api<ImportProductsResult>('/products/import', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async function choose(f: File | undefined) {
    setCheck(null);
    setError(null);
    if (!f) return;
    if (f.size > MAX_BYTES) {
      setError(t('import.tooBig'));
      return;
    }
    setFile(f);
    setBusy(true);
    try {
      const text = await readText(f);
      setCsv(text);
      setCheck(await send({ csv: text, dryRun: true }));
    } catch (err) {
      setError(errorMessage(err, t));
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!csv) return;
    setBusy(true);
    try {
      const result = await send({ csv, dryRun: false });
      if (result.errors.length) {
        setCheck(result);
        return;
      }
      toast.success(t('import.done', { created: result.created, updated: result.updated }));
      onImported();
      onClose();
    } catch (err) {
      setError(errorMessage(err, t));
    } finally {
      setBusy(false);
    }
  }

  function downloadTemplate() {
    const tpl = TEMPLATE[locale];
    const blob = new Blob(['﻿' + tpl.header + '\r\n' + tpl.example + '\r\n'], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = tpl.file;
    a.click();
    URL.revokeObjectURL(url);
  }

  const ok = check && check.errors.length === 0;

  return (
    <Modal
      open
      size="lg"
      onClose={busy ? () => undefined : onClose}
      title={t('import.title')}
      description={t('import.help')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button onClick={confirm} disabled={!ok || check.rows === 0} loading={busy && !!check}>
            {ok
              ? t('import.confirm', { count: check.created + check.updated })
              : t('import.confirmShort')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={input}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              void choose(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          <Button
            icon={FileSpreadsheet}
            variant="secondary"
            loading={busy && !check}
            onClick={() => input.current?.click()}
          >
            {file ? t('import.chooseOther') : t('import.choose')}
          </Button>
          {file && <span className="truncate text-sm text-slate-600">{file.name}</span>}
          <button
            type="button"
            onClick={downloadTemplate}
            className="ml-auto inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:underline"
          >
            <FileDown className="size-4" />
            <span>{t('import.template')}</span>
          </button>
        </div>

        <ul className="list-disc space-y-1 rounded-md bg-slate-50 px-8 py-3 text-xs text-slate-600">
          <li>{t('import.rule.update')}</li>
          <li>{t('import.rule.columns')}</li>
          <li>{t('import.rule.categories')}</li>
          <li>{t('import.rule.atomic')}</li>
        </ul>

        {error && (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        {check && ok && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            <p className="flex items-center gap-2 font-medium">
              <CheckCircle2 className="size-4" />
              <span>{t('import.checkOk', { rows: check.rows })}</span>
            </p>
            <ul className="mt-2 space-y-0.5 pl-6">
              <li>{t('import.willCreate', { count: check.created })}</li>
              <li>{t('import.willUpdate', { count: check.updated })}</li>
              {check.newCategories.length > 0 && (
                <li>{t('import.newCategories', { list: check.newCategories.join(', ') })}</li>
              )}
            </ul>
          </div>
        )}

        {check && !ok && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <p className="flex items-center gap-2 font-medium">
              <AlertTriangle className="size-4" />
              <span>{t('import.checkErrors', { count: check.errors.length })}</span>
            </p>
            <div className="mt-2 max-h-60 overflow-y-auto rounded border border-red-100 bg-white">
              <table className="w-full text-xs">
                <tbody className="divide-y divide-red-50">
                  {check.errors.map((e, i) => (
                    <tr key={i}>
                      <td className="w-20 px-3 py-1.5 font-medium whitespace-nowrap text-slate-500">
                        {t('import.line', { line: e.line })}
                      </td>
                      <td className="px-3 py-1.5 text-slate-700">
                        {translateMessage(e.message, t)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs">{t('import.fixAndRetry')}</p>
          </div>
        )}
      </div>
    </Modal>
  );
}

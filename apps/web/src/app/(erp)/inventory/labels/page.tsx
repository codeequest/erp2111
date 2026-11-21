'use client';

import { Suspense, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Loader2, Printer } from 'lucide-react';
import type { ProductLabelItem } from '@erp/shared';
import { useCompany } from '@/lib/company';
import { useI18n } from '@/lib/i18n';
import { errorMessage } from '@/lib/errors';
import { useApiQuery, withQuery } from '@/lib/use-api';
import { Barcode } from '@/components/barcode';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, inputClass } from '@/components/ui/form';
import { Card, PageHeader, RequirePermission } from '@/components/ui/page';

/** A4 sheet, 3 × 8 labels of 70 × 37 mm, no side margin (Avery 3474 type). */
const SHEET = { cols: 3, rows: 8, labelW: 70, labelH: 37, top: 0.5 };
const PER_SHEET = SHEET.cols * SHEET.rows;

export default function LabelsPage() {
  return (
    <RequirePermission permission="inventory.product.read">
      <Suspense>
        <LabelsScreen />
      </Suspense>
    </RequirePermission>
  );
}

function LabelsScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const ids = useSearchParams().get('ids') ?? '';
  const items = useApiQuery<ProductLabelItem[]>(
    ids ? withQuery('/products/labels', { ids }) : null,
  );

  const [withPackagings, setWithPackagings] = useState(false);
  const [copies, setCopies] = useState('1');
  const [start, setStart] = useState('1');

  const copyCount = clamp(Number(copies) || 1, 1, 200);
  const startAt = clamp(Number(start) || 1, 1, PER_SHEET);

  // The first item of each product is the base unit; the next ones are packagings.
  const labels = useMemo(() => {
    const list = (items.data ?? []).filter(
      (it, i, all) => withPackagings || i === 0 || all[i - 1].productId !== it.productId,
    );
    return list.flatMap((it) => Array.from({ length: copyCount }, () => it));
  }, [items.data, withPackagings, copyCount]);
  const hasPackagings = (items.data ?? []).some(
    (it, i, all) => i > 0 && all[i - 1].productId === it.productId,
  );

  // Empty slots first, to skip labels already used on the sheet.
  const slots: (ProductLabelItem | null)[] = [...Array(startAt - 1).fill(null), ...labels];
  const sheets: (ProductLabelItem | null)[][] = [];
  for (let i = 0; i < slots.length; i += PER_SHEET) sheets.push(slots.slice(i, i + PER_SHEET));

  return (
    <div className="mx-auto max-w-5xl space-y-6 print:m-0 print:max-w-none print:space-y-0">
      <div className="space-y-6 print:hidden">
        <PageHeader
          href="/inventory/products"
          title={t('labels.title')}
          crumb={t('labels.title')}
          description={t('labels.help')}
          actions={
            <>
              <Button variant="secondary" icon={ArrowLeft} onClick={() => router.back()}>
                {t('common.back')}
              </Button>
              <Button icon={Printer} onClick={() => window.print()} disabled={labels.length === 0}>
                {t('labels.print', { count: labels.length })}
              </Button>
            </>
          }
        />

        <Card>
          <div className="grid items-end gap-4 sm:grid-cols-3">
            <Field label={t('labels.copies')} hint={t('labels.copiesHint')}>
              {(id) => (
                <input
                  id={id}
                  type="number"
                  min={1}
                  max={200}
                  value={copies}
                  onChange={(e) => setCopies(e.target.value)}
                  className={inputClass}
                />
              )}
            </Field>
            <Field label={t('labels.start')} hint={t('labels.startHint', { max: PER_SHEET })}>
              {(id) => (
                <input
                  id={id}
                  type="number"
                  min={1}
                  max={PER_SHEET}
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  className={inputClass}
                />
              )}
            </Field>
            <div className="pb-6">
              <Checkbox
                checked={withPackagings}
                disabled={!hasPackagings}
                onChange={(e) => setWithPackagings(e.target.checked)}
                label={t('labels.withPackagings')}
              />
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-500">{t('labels.printTip')}</p>
        </Card>
      </div>

      {!ids ? (
        <p className="py-16 text-center text-sm text-slate-500 print:hidden">{t('labels.none')}</p>
      ) : items.loading && !items.data ? (
        <div className="flex justify-center py-16 text-slate-400 print:hidden">
          <Loader2 className="size-6 animate-spin" />
        </div>
      ) : items.error ? (
        <p className="py-16 text-center text-sm text-red-600 print:hidden">
          {errorMessage(items.error, t)}
        </p>
      ) : (
        <div className="space-y-6 overflow-x-auto print:space-y-0 print:overflow-visible">
          {sheets.map((sheet, s) => (
            <div
              key={s}
              className="label-sheet mx-auto bg-white shadow-md ring-1 ring-slate-200 print:shadow-none print:ring-0"
              style={{
                width: '210mm',
                height: '297mm',
                paddingTop: `${SHEET.top}mm`,
                display: 'grid',
                gridTemplateColumns: `repeat(${SHEET.cols}, ${SHEET.labelW}mm)`,
                gridAutoRows: `${SHEET.labelH}mm`,
              }}
            >
              {sheet.map((it, i) =>
                it ? <Label key={i} item={it} /> : <div key={i} className="label-empty" />,
              )}
            </div>
          ))}
        </div>
      )}

      {/* Print exactly the sheets, nothing else, with no browser margins. */}
      <style>{`
        @media print {
          @page { size: A4; margin: 0; }
          .label-sheet { break-after: page; }
          .label-sheet:last-child { break-after: auto; }
        }
        @media screen {
          .label-empty { background: repeating-linear-gradient(45deg, #f8fafc, #f8fafc 6px, #f1f5f9 6px, #f1f5f9 12px); }
        }
      `}</style>
    </div>
  );
}

/** One 70 × 37 mm label: reference + unit, price incl. VAT, barcode. */
function Label({ item }: { item: ProductLabelItem }) {
  const { money } = useCompany();
  const code = item.barcode ?? item.sku;
  return (
    <div
      className="flex flex-col justify-between overflow-hidden text-black"
      style={{ padding: '2.5mm 4mm' }}
    >
      <div className="flex items-start justify-between gap-2" style={{ fontSize: '8pt' }}>
        <span className="truncate font-mono">{item.sku}</span>
        <span className="shrink-0 font-semibold">{item.unitCode}</span>
      </div>
      <p className="text-right leading-none font-bold" style={{ fontSize: '17pt' }}>
        {money(item.priceInclTax)}
      </p>
      <div className="flex justify-center" style={{ height: '15mm' }}>
        <Barcode value={code} height={38} width={1.3} fontSize={10} className="h-full max-w-full" />
      </div>
    </div>
  );
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.floor(n)));
}

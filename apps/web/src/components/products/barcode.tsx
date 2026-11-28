'use client';

import { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';

import { tr } from '@/lib/i18n';
/**
 * Draws a barcode as SVG. 13-digit codes with a valid check digit are drawn
 * as EAN-13 (what shop scanners expect); anything else as Code 128.
 */
export function Barcode({ value, height = 40 }: { value: string; height?: number }) {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const common = { height, margin: 0, fontSize: 11, textMargin: 1, width: 1.4 };
    let ok = false;
    if (/^\d{13}$/.test(value)) {
      try {
        JsBarcode(ref.current, value, {
          ...common,
          format: 'EAN13',
          flat: true,
          valid: (v) => (ok = v),
        });
      } catch {
        ok = false;
      }
    }
    if (!ok) JsBarcode(ref.current, value, { ...common, format: 'CODE128' });
  }, [value, height]);

  return <svg ref={ref} className="max-w-full" role="img" aria-label={tr('Barcode {value}', { value })} />;
}
